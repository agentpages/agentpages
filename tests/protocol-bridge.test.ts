import {
  createPeer,
  EXTENSION_ID,
  InitializeResultSchema,
  type JsonRpcMessage,
  METHOD_NOT_FOUND,
  methodNotFound,
  type Peer,
  type PeerHandlers,
  type Reply,
  type Served,
  validate,
} from "@agentpages/protocol";
import { expect, test } from "vitest";
import { counter, type ManualTimers, manualTimers, portPair, type Scripted, scriptedPort } from "./support/bridge.ts";
import { capabilityExample } from "./support/spec.ts";
import { isObject, type JsonObject } from "./support/json.ts";

interface Heard {
  method: string;
  params: unknown;
}

interface Subject {
  peer: Peer;
  other: Scripted;
  timers: ManualTimers;
  requests: Heard[];
  notifications: Heard[];
}

const echo: PeerHandlers["request"] = (message) => Promise.resolve({ result: message });

/** A peer that answers with `serve` and counts its ids from 1, and the scripted peer at the other end. */
const subject = (serve: (message: Heard) => Promise<Served> = echo): Subject => {
  const { port, peer: other } = scriptedPort();
  const timers = manualTimers();
  const requests: Heard[] = [];
  const notifications: Heard[] = [];
  const handlers: PeerHandlers = {
    request: (message) => {
      requests.push(message);
      return serve(message);
    },
    notification: (message) => {
      notifications.push(message);
    },
  };
  return { peer: createPeer({ port, timers, id: counter() }, handlers), other, timers, requests, notifications };
};

const idOf = (message: JsonRpcMessage): unknown => ("id" in message ? message.id : undefined);

const PENDING = Symbol("pending");

/** What a promise resolved with, or `PENDING` when it has not. */
const settled = (promise: Promise<Reply>): Promise<Reply | typeof PENDING> =>
  Promise.race([
    promise,
    new Promise<typeof PENDING>((resolve) => {
      setImmediate(() => {
        resolve(PENDING);
      });
    }),
  ]);

const named = (name: string): PeerHandlers => ({
  request: ({ method }) => Promise.resolve({ result: `${name} answers ${method}` }),
  notification: () => {},
});

const known = (message: Heard): Promise<Served> =>
  Promise.resolve(message.method === "known" ? { result: { done: true } } : { error: methodNotFound() });

test("[RPC-1] an answer reaches the request whose id it carries, whatever the order of the answers", async () => {
  const { peer, other, timers } = subject();
  const first = peer.request({ method: "first", params: { n: 1 }, timeoutMs: 1000 });
  const second = peer.request({ method: "second", timeoutMs: 1000 });
  const sent = [await other.next(), await other.next()];
  await other.send({ jsonrpc: "2.0", id: 2, error: { code: -32_050, message: "No such thing.", data: { requestId: "r" } } });
  await other.send({ jsonrpc: "2.0", id: 1, result: { n: 1 }, unknown: true });

  expect(sent).toStrictEqual([
    { jsonrpc: "2.0", id: 1, method: "first", params: { n: 1 } },
    { jsonrpc: "2.0", id: 2, method: "second" },
  ]);
  expect(await first).toStrictEqual({ kind: "result", result: { n: 1 } });
  expect(await second).toStrictEqual({
    kind: "error",
    error: { code: -32_050, message: "No such thing.", data: { requestId: "r" } },
  });
  expect(timers.waiting()).toBe(0);
});

test("[RPC-1] each end has its own ids: two ends that both count from 1 answer each other", async () => {
  const [near, far] = portPair();
  const view = createPeer({ port: near, timers: manualTimers(), id: counter() }, named("view"));
  const host = createPeer({ port: far, timers: manualTimers(), id: counter() }, named("host"));
  const replies = await Promise.all([
    view.request({ method: "to-host", timeoutMs: 1000 }),
    host.request({ method: "to-view", timeoutMs: 1000 }),
  ]);

  expect(replies).toStrictEqual([
    { kind: "result", result: "host answers to-host" },
    { kind: "result", result: "view answers to-view" },
  ]);
});

test("[RPC-1] a request is answered under its id with what the handler made of it, and -32601 when it has no such method", async () => {
  const { other, requests } = subject(known);
  await other.send({ jsonrpc: "2.0", id: "host-1", method: "known", params: { a: 1 }, unknown: true });
  await other.send({ jsonrpc: "2.0", id: 7, method: "agentpages/absent" });
  const answers = [await other.next(), await other.next()];

  expect(requests).toStrictEqual([
    { method: "known", params: { a: 1 } },
    { method: "agentpages/absent", params: undefined },
  ]);
  expect(answers).toStrictEqual([
    { jsonrpc: "2.0", id: "host-1", result: { done: true } },
    { jsonrpc: "2.0", id: 7, error: methodNotFound() },
  ]);
  expect(methodNotFound()).toStrictEqual({ code: METHOD_NOT_FOUND, message: "Method not found." });
});

test("a notification reaches its handler and gets no answer", async () => {
  const { peer, other, requests, notifications } = subject();
  await other.send({ jsonrpc: "2.0", method: "agentpages/state/committed", params: { scope: "page" } });
  await other.send({ jsonrpc: "2.0", method: "bare" });
  peer.notify({ method: "ui/notifications/initialized" });
  peer.notify({ method: "with", params: { a: 1 } });

  expect(notifications).toStrictEqual([
    { method: "agentpages/state/committed", params: { scope: "page" } },
    { method: "bare", params: undefined },
  ]);
  expect(requests).toStrictEqual([]);
  expect([await other.next(), await other.next()]).toStrictEqual([
    { jsonrpc: "2.0", method: "ui/notifications/initialized" },
    { jsonrpc: "2.0", method: "with", params: { a: 1 } },
  ]);
});

const NOT_MESSAGES: unknown[] = [
  "text",
  null,
  7,
  [],
  {},
  { method: "no-version" },
  { jsonrpc: "1.0", method: "old" },
  { jsonrpc: "2.0", method: 5 },
  { jsonrpc: "2.0", id: null, method: "null-id" },
  { jsonrpc: "2.0", id: { n: 1 }, method: "object-id" },
  { jsonrpc: "2.0", id: 1 },
  { jsonrpc: "2.0", id: null, result: {} },
  { jsonrpc: "2.0", result: {} },
  { jsonrpc: "1.0", id: 1, result: {} },
  { jsonrpc: "2.0", id: 1, error: "failed" },
  { jsonrpc: "2.0", id: 1, error: { code: "-32050", message: "Text for a code." } },
  { jsonrpc: "2.0", id: 1, error: { code: -32_050 } },
  { jsonrpc: "1.0", id: 1, error: { code: -32_050, message: "Old." } },
];

test("[RPC-2] what is not a JSON-RPC 2.0 request, notification or answer is dropped", async () => {
  const { peer, other, requests, notifications } = subject();
  const reply = peer.request({ method: "asked", timeoutMs: 1000 });
  const asked = await other.next();
  await NOT_MESSAGES.reduce<Promise<void>>((before, data) => before.then(() => other.send(data)), Promise.resolve());
  const dropped = await settled(reply);
  await other.send({ jsonrpc: "2.0", id: 1, result: "the answer" });
  peer.notify({ method: "mark" });

  expect(asked).toMatchObject({ id: 1 });
  expect(dropped).toBe(PENDING);
  expect(await reply).toStrictEqual({ kind: "result", result: "the answer" });
  expect([requests, notifications]).toStrictEqual([[], []]);
  expect(await other.next()).toStrictEqual({ jsonrpc: "2.0", method: "mark" });
});

test("[RPC-3] a request with no answer after timeoutMs resolves timeout, and an answer that comes later or twice is ignored", async () => {
  const { peer, other, timers } = subject();
  const late = peer.request({ method: "slow", timeoutMs: 30_000 });
  const twice = peer.request({ method: "fast", timeoutMs: 30_000 });
  const ids = [idOf(await other.next()), idOf(await other.next())];
  await other.send({ jsonrpc: "2.0", id: ids[1], result: "once" });
  timers.advance(29_999);
  const before = await settled(late);
  timers.advance(1);
  const after = await settled(late);
  await other.send({ jsonrpc: "2.0", id: ids[0], result: "too late" });
  await other.send({ jsonrpc: "2.0", id: ids[1], result: "again" });
  await other.send({ jsonrpc: "2.0", id: "never-asked", result: "nothing" });

  expect([before, after]).toStrictEqual([PENDING, { kind: "timeout" }]);
  expect(await twice).toStrictEqual({ kind: "result", result: "once" });
  expect([timers.waiting(), timers.staleCancels()]).toStrictEqual([0, 0]);
});

test("a closed peer resolves every pending request closed, stops their timers and hears nothing more", async () => {
  const { peer, other, timers, requests, notifications } = subject();
  const pending = [peer.request({ method: "one", timeoutMs: 1000 }), peer.request({ method: "two", timeoutMs: 2000 })];
  const ids = [idOf(await other.next()), idOf(await other.next())];
  peer.close();
  await other.send({ jsonrpc: "2.0", id: ids[0], result: "after the close" });
  await other.send({ jsonrpc: "2.0", id: "host-1", method: "asked" });
  await other.send({ jsonrpc: "2.0", method: "told" });
  peer.notify({ method: "mark" });

  expect(await Promise.all(pending)).toStrictEqual([{ kind: "closed" }, { kind: "closed" }]);
  expect([timers.waiting(), timers.staleCancels()]).toStrictEqual([0, 0]);
  expect([requests, notifications]).toStrictEqual([[], []]);
  expect(await other.next()).toStrictEqual({ jsonrpc: "2.0", method: "mark" });
});

const HOST_INFO = { name: "host", version: "1.0.0" };

const withoutRender = (capability: unknown): unknown =>
  isObject(capability) ? Object.fromEntries(Object.entries(capability).filter(([key]) => key !== "render")) : capability;

const initializeResult = (experimental: unknown): JsonObject => ({
  protocolVersion: "2026-01-26",
  hostInfo: { ...HOST_INFO, title: "A host" },
  hostCapabilities: { experimental, openLinks: {} },
  hostContext: { theme: "dark" },
  more: true,
});

test("[VER-1] the result of ui/initialize is read without render and without the fields this protocol does not know", () => {
  const read = validate(InitializeResultSchema, initializeResult({ [EXTENSION_ID]: capabilityExample, other: {} }));

  expect(read).toStrictEqual({
    ok: true,
    value: {
      protocolVersion: "2026-01-26",
      hostInfo: HOST_INFO,
      hostCapabilities: { experimental: { [EXTENSION_ID]: withoutRender(capabilityExample) } },
      hostContext: {},
    },
  });
});

const ADVERTISING = initializeResult({ [EXTENSION_ID]: capabilityExample });

test.each<[string, unknown]>([
  ["has no experimental capabilities", { ...initializeResult({}), hostCapabilities: {} }],
  ["does not advertise the extension", initializeResult({ other: {} })],
  ["advertises what is not a capability", initializeResult({ [EXTENSION_ID]: { version: "0.1" } })],
  ["names no host", { ...ADVERTISING, hostInfo: { name: "host" } }],
  ["has no version", { ...ADVERTISING, protocolVersion: 1 }],
  ["has no context", { ...ADVERTISING, hostContext: null }],
])("a result of ui/initialize that %s is not one of a host of this protocol", (_what, result) => {
  expect(validate(InitializeResultSchema, result).ok).toBe(false);
});
