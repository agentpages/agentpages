import { EXTENSION_ID, ID_PATTERN, type JsonRpcMessage, methodNotFound, toJsonRpcError } from "@agentpages/protocol";
import { expect, test } from "vitest";
import {
  answer,
  CAPABILITY,
  commitsOnly,
  failed,
  failing,
  heads,
  idOf,
  initialize,
  LINK,
  methodOf,
  probe,
  PROBED,
  request,
  settle,
  subject,
  type Subject,
  tick,
  TIMEOUT_MS,
  UNKNOWN,
} from "./support/host.ts";

const INITIALIZE = request(1, { method: "ui/initialize", params: { protocolVersion: "2026-01-26" } });

const INITIALIZED = { jsonrpc: "2.0", method: "ui/notifications/initialized" };

const { render: _render, ...WITHOUT_RENDER } = CAPABILITY;

const initializedWith = (capability: unknown): JsonRpcMessage => ({
  jsonrpc: "2.0",
  id: 1,
  result: {
    protocolVersion: "2026-01-26",
    hostInfo: { name: "@agentpages/host", version: "0.1" },
    hostCapabilities: { experimental: { [EXTENSION_ID]: capability } },
    hostContext: {},
  },
});

test("[EXT-2] [EXT-7] a host advertises the capability of its Store without render, under MCP Apps 2026-01-26", async () => {
  const { view, views } = subject();
  await view.send(INITIALIZE);
  expect(await view.next()).toStrictEqual(initializedWith(WITHOUT_RENDER));
  expect(views).toStrictEqual([]);
});

test("[EXT-2] a host advertises no feature its Store lacks", async () => {
  const { version, limits } = CAPABILITY;
  const { view } = subject({ capability: { version, limits } });
  await view.send(INITIALIZE);
  expect(await view.next()).toStrictEqual(initializedWith({ version, limits }));
});

test("[EXT-6] a host sends a view nothing of its own before it is initialized, and then a ping and no tool notification", async () => {
  const { view } = subject();
  await settle();
  expect(await probe(view)).toStrictEqual(PROBED);
  const first = await initialize(view);
  expect(first).toStrictEqual(request(idOf(first), { method: "ping" }));
  expect(await probe(view)).toStrictEqual(PROBED);
});

test("[REL-23] a host answers the ping of a view itself", async () => {
  const { view, views } = subject();
  await view.send(request(7, { method: "ping" }));
  expect(await view.next()).toStrictEqual({ jsonrpc: "2.0", id: 7, result: {} });
  expect(views).toStrictEqual([]);
});

test("[REL-11] a host passes a request of a view to the Store once, and its result back", async () => {
  const { view, views, store } = subject();
  store.view = () => ({ kind: "result", result: { document: null } });
  const params = { scope: "page", collection: "tasks", id: "a" };
  await view.send(request(4, { method: "agentpages/state/get", params }));
  expect(await view.next()).toStrictEqual({ jsonrpc: "2.0", id: 4, result: { document: null } });
  expect(views).toStrictEqual([{ method: "agentpages/state/get", params, url: LINK, requestId: "host-2" }]);
});

test("[REL-11] a host does not retry a request the Store could not take, and passes the error on", async () => {
  const { view, views, store, timers } = subject();
  store.view = () => failed("Unavailable");
  await view.send(request(4, { method: "agentpages/identity/get" }));
  const error = toJsonRpcError(failing("Unavailable"));
  expect(await view.next()).toStrictEqual({ jsonrpc: "2.0", id: 4, error });
  timers.advance(10 * TIMEOUT_MS);
  await settle();
  expect(views).toStrictEqual([{ method: "agentpages/identity/get", params: undefined, url: LINK, requestId: "host-2" }]);
});

test("[REL-25] a host chooses the requestId of every view request, whatever the message says", async () => {
  const { view, views } = subject();
  await view.send(request("mine", { method: "agentpages/identity/get", params: { requestId: "mine" } }));
  await view.send(request("mine-too", { method: "agentpages/identity/get" }));
  const ids = views.map(({ requestId }) => requestId);
  expect(ids).toStrictEqual(["host-2", "host-3"]);
  expect(ids.every((id) => ID_PATTERN.test(id))).toBe(true);
});

test("[EXT-4] a host answers a method its Store does not have with -32601", async () => {
  const { view, store } = subject();
  store.view = () => UNKNOWN;
  await view.send(request(9, { method: "agentpages/files/list", params: {} }));
  expect(await view.next()).toStrictEqual({ jsonrpc: "2.0", id: 9, error: methodNotFound() });
});

test("[EXT-4] a host passes an MCP Apps request it does not speak to the Store, which decides", async () => {
  const { view, views, store } = subject();
  store.view = () => UNKNOWN;
  await view.send(request(9, { method: "ui/open-link", params: { url: "https://example.test" } }));
  expect(await view.next()).toStrictEqual({ jsonrpc: "2.0", id: 9, error: methodNotFound() });
  expect(views.map(({ method }) => method)).toStrictEqual(["ui/open-link"]);
});

test("[RPC-2] a host drops what is not JSON-RPC, and a notification it does not know", async () => {
  const { view, views } = subject();
  await view.send({ id: 1, method: "agentpages/identity/get" });
  await view.send({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height: 10 } });
  expect(await probe(view)).toStrictEqual(PROBED);
  expect(views).toStrictEqual([]);
});

test("[SEC-3] no message a host posts carries the link of the viewer", async () => {
  const { view, store, mounted, hosts, ...served } = subject();
  store.view = commitsOnly;
  const posted = [await initialize(view)];
  await view.send(INITIALIZE);
  await view.send(request(2, { method: "agentpages/state/get", params: {} }));
  posted.push(await view.next(), await view.next());
  store.heads = heads({ seq: 6 });
  await tick({ view, store, mounted, hosts, ...served });
  posted.push(await view.next());
  void mounted.close();
  posted.push(await view.next());
  expect(posted.map(methodOf)).toStrictEqual([
    "ping",
    "none",
    "none",
    "agentpages/state/committed",
    "ui/resource-teardown",
  ]);
  expect(hosts.map(({ input }) => input)).toContainEqual({ url: LINK });
  expect(JSON.stringify(posted)).not.toContain("the-secret-of-the-link");
});

/** A host that is closing a view that answers its pings, the teardown it sent, and what its `close` resolves with. */
const closing = async (): Promise<Subject & { teardown: JsonRpcMessage; closed: { done: Promise<void> } }> => {
  const served = subject();
  await answer(served.view, await initialize(served.view));
  const closed = { done: served.mounted.close() };
  return { ...served, closed, teardown: await served.view.next() };
};

test("[EXT-8] close sends an initialized view ui/resource-teardown with a reason and resolves on its answer", async () => {
  const { view, closed, teardown } = await closing();
  expect(teardown).toStrictEqual(request(idOf(teardown), { method: "ui/resource-teardown", params: { reason: "closed" } }));
  expect(ID_PATTERN.test(String(idOf(teardown)))).toBe(true);
  await answer(view, teardown);
  await expect(closed.done).resolves.toBeUndefined();
});

test("[EXT-8] close waits for the answer to its teardown no longer than requestTimeoutMs", async () => {
  const { timers, closed } = await closing();
  timers.advance(TIMEOUT_MS - 1);
  expect(timers.waiting()).toBe(1);
  timers.advance(1);
  await closed.done;
  expect(timers.waiting()).toBe(0);
});

test("[EXT-8] close sends nothing to a view that never initialized, and nothing a second time", async () => {
  const idle = subject();
  await idle.mounted.close();
  expect(idle.timers.waiting()).toBe(0);
  const { view, mounted, closed, teardown } = await closing();
  const again = mounted.close();
  expect(await probe(view)).toStrictEqual(PROBED);
  await answer(view, teardown);
  await expect(Promise.all([closed.done, again])).resolves.toStrictEqual([undefined, undefined]);
});

test("[REL-17] a closed host hears its view no longer and asks the Store nothing more", async () => {
  const { view, views, hosts, mounted, timers, events } = subject();
  await settle();
  await mounted.close();
  await view.send(request(1, { method: "agentpages/identity/get" }));
  await view.send(INITIALIZED);
  timers.advance(10 * TIMEOUT_MS);
  await settle();
  expect([views, events]).toStrictEqual([[], []]);
  expect(hosts).toHaveLength(1);
  expect(timers.waiting()).toBe(0);
});
