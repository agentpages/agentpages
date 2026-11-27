import { validate } from "../common/validate.js";
import { JSONRPC_VERSION } from "../jsonrpc/constants.js";
import { JsonRpcMessageSchema } from "../jsonrpc/schemas.js";
import type { JsonRpcFailed, JsonRpcId, JsonRpcMessage, JsonRpcRequest } from "../jsonrpc/types.js";
import type { Port, Timers } from "./ports.js";

export type Reply =
  | { kind: "result"; result: unknown }
  | { kind: "error"; error: JsonRpcFailed["error"] }
  | { kind: "timeout" }
  | { kind: "closed" };

export interface Call {
  method: string;
  params?: unknown;
  timeoutMs: number;
}

/** The answer to a request. A method the receiver does not have is `{ error: methodNotFound() }`. */
export type Served = { result: unknown } | { error: JsonRpcFailed["error"] };

export interface PeerHandlers {
  request(message: { method: string; params: unknown }): Promise<Served>;
  notification(message: { method: string; params: unknown }): void;
}

export interface Peer {
  /** Resolves with the answer, or `timeout` after `timeoutMs`. A later answer is ignored. */
  request(call: Call): Promise<Reply>;
  notify(message: { method: string; params?: unknown }): void;
  /** Stops listening and posts nothing more. Every pending request resolves `closed`, and so does a later one. */
  close(): void;
}

export interface PeerPorts {
  port: Port;
  timers: Timers;
  /** The `id` of the next request. It never returns one of a pending request. */
  id: () => JsonRpcId;
}

type Pending = Map<JsonRpcId, (reply: Reply) => void>;

/** What a peer sends through: nothing once it is closed. */
interface Line {
  ports: PeerPorts;
  pending: Pending;
  post: (message: JsonRpcMessage) => void;
}

/** A call as it is sent: without `params` when it has none. */
const sentOf = ({ method, params }: { method: string; params?: unknown }): { method: string; params?: unknown } =>
  params === undefined ? { method } : { method, params };

const replyOf = (answer: Exclude<JsonRpcMessage, { method: string }>): Reply =>
  "result" in answer ? { kind: "result", result: answer.result } : { kind: "error", error: answer.error };

const serve = async ({ post }: Line, [handlers, { id, method, params }]: [PeerHandlers, JsonRpcRequest]): Promise<void> => {
  post({ jsonrpc: JSONRPC_VERSION, id, ...(await handlers.request({ method, params })) });
};

const ask = ({ ports, pending, post }: Line, { timeoutMs, ...call }: Call): Promise<Reply> =>
  new Promise((resolve) => {
    const id = ports.id();
    const cancel = ports.timers.after(timeoutMs, () => {
      pending.delete(id);
      resolve({ kind: "timeout" });
    });
    pending.set(id, (reply) => {
      pending.delete(id);
      cancel();
      resolve(reply);
    });
    post({ jsonrpc: JSONRPC_VERSION, id, ...sentOf(call) });
  });

/**
 * One end of a JSON-RPC 2.0 conversation over a port. It answers the other end's requests with what `handlers` make
 * of them, drops what is not a JSON-RPC message, and never sends a request twice.
 */
export const createPeer = (ports: PeerPorts, handlers: PeerHandlers): Peer => {
  const state = { open: true };
  const line: Line = {
    ports,
    pending: new Map(),
    post: (message) => {
      if (state.open) ports.port.post(message);
    },
  };
  const receive = (message: JsonRpcMessage): void => {
    if (!("method" in message)) line.pending.get(message.id)?.(replyOf(message));
    else if ("id" in message) void serve(line, [handlers, message]);
    else handlers.notification({ method: message.method, params: message.params });
  };
  const stop = ports.port.listen((data) => {
    const message = validate(JsonRpcMessageSchema, data);
    if (message.ok) receive(message.value);
  });
  return {
    request: (call) => (state.open ? ask(line, call) : Promise.resolve({ kind: "closed" })),
    notify: (message) => {
      line.post({ jsonrpc: JSONRPC_VERSION, ...sentOf(message) });
    },
    close: () => {
      state.open = false;
      stop();
      [...line.pending.values()].forEach((resolve) => {
        resolve({ kind: "closed" });
      });
    },
  };
};
