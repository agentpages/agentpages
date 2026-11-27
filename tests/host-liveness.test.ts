import { ID_PATTERN } from "@agentpages/protocol";
import { expect, test } from "vitest";
import { answer, idOf, initialize, probe, PROBED, request, settle, subject, tick, TIMEOUT_MS } from "./support/host.ts";

const INITIALIZED = { jsonrpc: "2.0", method: "ui/notifications/initialized" };

test("[REL-33] a host pings an initialized view, and again requestTimeoutMs after each answer", async () => {
  const { view, timers, events } = subject();
  const first = await initialize(view);
  expect(first).toStrictEqual(request(idOf(first), { method: "ping" }));
  expect(ID_PATTERN.test(String(idOf(first)))).toBe(true);
  timers.advance(TIMEOUT_MS - 1);
  await answer(view, first);
  timers.advance(TIMEOUT_MS - 1);
  expect(await probe(view)).toStrictEqual(PROBED);
  timers.advance(1);
  const second = await view.next();
  expect(second).toStrictEqual(request(idOf(second), { method: "ping" }));
  expect(idOf(second)).not.toBe(idOf(first));
  expect(events).toStrictEqual([]);
});

test("[REL-33] a view that answers a ping with an error is pinged again", async () => {
  const { view, timers, events } = subject();
  const first = await initialize(view);
  await view.send({ jsonrpc: "2.0", id: idOf(first), error: { code: -32_601, message: "Method not found." } });
  timers.advance(TIMEOUT_MS);
  expect(await view.next()).toMatchObject({ method: "ping" });
  expect(events).toStrictEqual([]);
});

test("[REL-33] a view that says it is initialized twice is pinged once", async () => {
  const { view } = subject();
  await initialize(view);
  await view.send(INITIALIZED);
  expect(await probe(view)).toStrictEqual(PROBED);
});

test("[REL-23] a host that gets no answer to a ping in requestTimeoutMs reports it once, pings no more and keeps asking for heads", async () => {
  const served = subject();
  await initialize(served.view);
  served.timers.advance(TIMEOUT_MS - 1);
  expect(served.events).toStrictEqual([]);
  await tick(served, 1);
  expect(served.events).toStrictEqual([{ kind: "unresponsive" }]);
  const asked = served.hosts.length;
  await tick(served, 3 * TIMEOUT_MS);
  await tick(served);
  expect(served.events).toStrictEqual([{ kind: "unresponsive" }]);
  expect(await probe(served.view)).toStrictEqual(PROBED);
  expect(served.hosts.length).toBeGreaterThan(asked);
});

test("[REL-23] a view that never initialized is never pinged and never reported", async () => {
  const served = subject();
  await tick(served, 3 * TIMEOUT_MS);
  expect(served.events).toStrictEqual([]);
  expect(await probe(served.view)).toStrictEqual(PROBED);
});

test("[EXT-8] a host sends no teardown to a view that stopped answering", async () => {
  const { view, timers, mounted } = subject();
  await initialize(view);
  timers.advance(TIMEOUT_MS);
  await settle();
  const closed = mounted.close();
  expect(timers.waiting()).toBe(0);
  await expect(closed).resolves.toBeUndefined();
});

test("[REL-23] a host closed between two pings sends no other", async () => {
  const { view, timers, mounted } = subject();
  await answer(view, await initialize(view));
  await settle();
  const closed = mounted.close();
  await answer(view, await view.next());
  await closed;
  expect(timers.waiting()).toBe(0);
});

test("[REL-23] a view that answers a ping while it is torn down is not pinged again", async () => {
  const { view, timers, mounted } = subject();
  const ping = await initialize(view);
  const closed = mounted.close();
  const teardown = await view.next();
  await answer(view, ping);
  await settle();
  expect(timers.waiting()).toBe(1);
  await answer(view, teardown);
  await closed;
  expect(timers.waiting()).toBe(0);
});

test("[REL-23] a view that is being torn down is not reported for the ping it left unanswered", async () => {
  const { view, timers, mounted, events } = subject();
  await initialize(view);
  timers.advance(TIMEOUT_MS - 1);
  const closed = mounted.close();
  await view.next();
  timers.advance(1);
  await settle();
  expect(events).toStrictEqual([]);
  timers.advance(TIMEOUT_MS);
  await closed;
  expect(timers.waiting()).toBe(0);
});
