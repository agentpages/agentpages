import { type HostEvent, type Mounted, serve, type Serving } from "@agentpages/host";
import {
  type Answer,
  type Capability,
  type Commit,
  type ErrorName,
  type Failure,
  failure,
  type Heads,
  type HostRequest,
  type JsonRpcMessage,
  PROTOCOL_VERSION,
  type ViewRequest,
} from "@agentpages/protocol";
import { counter, type ManualTimers, manualTimers, type Scripted, scriptedPort } from "./bridge.ts";
import { ADVERTISED, op } from "./store.ts";

/** The link of the viewer. Its last part is the secret a view must never see. */
export const LINK = "https://pages.test/p/the-secret-of-the-link";

export const CAPABILITY: Capability = { version: PROTOCOL_VERSION, ...ADVERTISED };

export const TIMEOUT_MS: number = CAPABILITY.limits.requestTimeoutMs;

/** The version the view under test shows. */
export const SHOWN = 3;

/** What the fake Store answers. A test replaces either while it runs. */
interface Scripts {
  heads: Answer | Promise<Answer>;
  view: (request: ViewRequest) => Answer | Promise<Answer>;
}

export interface Subject {
  mounted: Mounted;
  /** The view at the other end of the host's port. */
  view: Scripted;
  timers: ManualTimers;
  events: HostEvent[];
  /** Every host operation the link was asked, in order. */
  hosts: HostRequest[];
  /** Every view request the link was asked, in order. */
  views: ViewRequest[];
  store: Scripts;
}

export const heads = (changed: Partial<Heads> = {}): Answer => ({
  kind: "result",
  result: { version: SHOWN, seq: 5, comments: 2, ...changed },
});

export const failing = (error: Exclude<ErrorName, "RateLimited">): Failure =>
  failure({ error, message: `${error}.`, requestId: "store-request" });

export const failed = (error: Exclude<ErrorName, "RateLimited">): Answer => ({ kind: "failure", failure: failing(error) });

export const UNKNOWN: Answer = { kind: "unknown-method", code: -32_601 };

export const commit = (seq: number): Commit => ({
  seq,
  opId: op(seq),
  at: "2026-01-01T00:00:00.000Z",
  by: { kind: "agent" },
  changes: [],
});

/** A page of `commits` that ends at the last of them. */
export const commits = (...seqs: number[]): Answer => ({
  kind: "result",
  result: { commits: seqs.map(commit), seq: seqs.at(-1) ?? 0 },
});

/** A host that serves a view over a scripted port, with a link that records what it is asked. */
export const subject = (serving: Partial<Serving> = {}): Subject => {
  const { port, peer: view } = scriptedPort();
  const timers = manualTimers();
  const events: HostEvent[] = [];
  const hosts: HostRequest[] = [];
  const views: ViewRequest[] = [];
  const store: Scripts = { heads: heads(), view: () => ({ kind: "result", result: {} }) };
  const link: Serving["link"] = {
    host: (request) => {
      hosts.push(request);
      return Promise.resolve(store.heads);
    },
    view: (request) => {
      views.push(request);
      return Promise.resolve(store.view(request));
    },
  };
  const on = (event: HostEvent): void => {
    events.push(event);
  };
  const served = { url: LINK, version: SHOWN, capability: CAPABILITY, link, on, ...serving };
  const mounted = serve(served, { port, timers, id: counter("host-") });
  return { mounted, view, timers, events, hosts, views, store };
};

/** Lets everything that is ready to run do so: promises, and messages already posted. */
export const settle = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

export const request = (id: number | string, call: { method: string; params?: unknown }): JsonRpcMessage => ({
  jsonrpc: "2.0",
  id,
  ...call,
});

export const idOf = (message: JsonRpcMessage): number | string => ("id" in message ? message.id : "none");

export const methodOf = (message: JsonRpcMessage): string => ("method" in message ? message.method : "none");

/** A Store that has `seqs` as the commits of the `viewer` scope and `6` as the one of the `page` scope. */
export const commitsByScope =
  (...seqs: number[]) =>
  ({ params }: ViewRequest): Answer =>
    JSON.stringify(params).includes("viewer") ? commits(...seqs) : commits(6);

/** A Store that answers its first request with the first of `answers`, and so on. */
export const inTurn = (...answers: Answer[]): Scripts["view"] => {
  const left = [...answers];
  return () => left.shift() ?? failed("Internal");
};

/** A Store that has commit 6 and refuses every other request. */
export const commitsOnly = ({ method }: ViewRequest): Answer =>
  method === "agentpages/state/commits" ? commits(6) : failed("Forbidden");

/** Answers a request of the host with `{}`. */
export const answer = (view: Scripted, message: JsonRpcMessage): Promise<void> =>
  view.send({ jsonrpc: "2.0", id: idOf(message), result: {} });

/** Runs the handshake as a view does, and returns the first message the host sends after it. */
export const initialize = async (view: Scripted): Promise<JsonRpcMessage> => {
  const params = { appInfo: { name: "page", version: "1" }, appCapabilities: {}, protocolVersion: "2026-01-26" };
  await view.send(request(0, { method: "ui/initialize", params }));
  await view.next();
  await view.send({ jsonrpc: "2.0", method: "ui/notifications/initialized" });
  return view.next();
};

export const PROBED: JsonRpcMessage = { jsonrpc: "2.0", id: "probe", result: {} };

/** Pings the host and returns the next message it posted: `PROBED` exactly when it posted nothing before. */
export const probe = async (view: Scripted): Promise<JsonRpcMessage> => {
  await view.send(request("probe", { method: "ping" }));
  return view.next();
};

/** Moves the time on by one wait of the poll and lets the poll run. */
export const tick = async ({ timers }: Subject, ms = 1000): Promise<void> => {
  timers.advance(ms);
  await settle();
};

/** A promise a test resolves when it chooses. */
export const gate = <T>(): { promise: Promise<T>; open: (value: T) => void } => {
  const opened: { open: (value: T) => void } = { open: () => {} };
  const promise = new Promise<T>((resolve) => {
    opened.open = resolve;
  });
  return { promise, open: (value) => { opened.open(value); } };
};
