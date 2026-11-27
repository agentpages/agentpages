import type { Answer, Capability, JsonRpcMessage } from "@agentpages/protocol";
import { expect, test } from "vitest";
import {
  answer,
  CAPABILITY,
  commit,
  commits,
  commitsByScope,
  failed,
  gate,
  heads,
  initialize,
  LINK,
  probe,
  PROBED,
  settle,
  subject,
  type Subject,
  tick,
  TIMEOUT_MS,
  UNKNOWN,
} from "./support/host.ts";

const committed = (scope: string, seq: number): JsonRpcMessage => ({
  jsonrpc: "2.0",
  method: "agentpages/state/committed",
  params: { scope, commit: commit(seq) },
});

const fetches = ({ views }: Subject): unknown[] => views.map(({ method, params }) => [method, params]);

const fetch = (scope: string, since: number): unknown[] => ["agentpages/state/commits", { scope, since }];

/** A host whose view is initialized and whose first heads were at `seq` 5. */
const live = async (serving: Parameters<typeof subject>[0] = {}): Promise<Subject> => {
  const served = subject(serving);
  await initialize(served.view);
  return served;
};

/** The same, with the Store now at `seq` and its commits ready to fetch. */
const behind = async (answered: Answer | Promise<Answer>, seq = 7): Promise<Subject> => {
  const served = await live();
  served.store.heads = heads({ seq });
  served.store.view = () => answered;
  await tick(served);
  return served;
};

/** What a host that should have stopped asking did in the five seconds that follow. */
const afterwards = async (served: Subject): Promise<unknown> => {
  await tick(served, 5000);
  return { events: served.events, asked: served.hosts.length, waiting: served.timers.waiting() };
};

/** Puts commit 6 in the Store and lets the host learn of it. */
const commitSixth = async (served: Subject): Promise<void> => {
  served.store.heads = heads({ seq: 6 });
  served.store.view = () => commits(6);
  await tick(served);
};

/** What the Store was asked for the view, and the next message the view got: `PROBED` when the host sent none. */
const sentToView = async (served: Subject): Promise<unknown> => [served.views, await probe(served.view)];

const ENDINGS: { name: string; answered: Answer; event: unknown }[] = [
  { name: "[PAGES-19] a new version", answered: heads({ version: 4, comments: 9, seq: 9 }), event: { kind: "version", version: 4 } },
  { name: "[HOST-8] NotFound", answered: failed("NotFound"), event: { kind: "closed", error: "NotFound" } },
  { name: "[HOST-8] Forbidden", answered: failed("Forbidden"), event: { kind: "closed", error: "Forbidden" } },
];

test("[HOST-7] a host asks pages_heads for the link of its viewer at once, and again after each answer and a wait", async () => {
  const served = subject();
  expect(served.hosts).toStrictEqual([{ operation: "pages_heads", input: { url: LINK }, requestId: "host-1" }]);
  await settle();
  await tick(served, 999);
  expect(served.hosts).toHaveLength(1);
  await tick(served, 1);
  await tick(served);
  expect(served.hosts.map(({ requestId }) => requestId)).toStrictEqual(["host-1", "host-2", "host-3"]);
  expect(served.events).toStrictEqual([]);
});

test("[HOST-7] a host waits intervalMs between an answer and the next pages_heads, and never asks two at once", async () => {
  const slow = gate<Answer>();
  const served = subject({ intervalMs: 50 });
  await settle();
  await tick(served, 49);
  expect(served.hosts).toHaveLength(1);
  served.store.heads = slow.promise;
  await tick(served, 1);
  await tick(served, 5000);
  expect(served.hosts).toHaveLength(2);
  expect(served.timers.waiting()).toBe(0);
  slow.open(heads());
  await settle();
  await tick(served, 49);
  expect(served.hosts).toHaveLength(2);
  await tick(served, 1);
  expect(served.hosts).toHaveLength(3);
});

test.each(ENDINGS)("[REL-17] $name is reported once, and the host asks for no more heads", async ({ answered, event }) => {
  const served = subject();
  await settle();
  served.store.heads = answered;
  await tick(served);
  expect(await afterwards(served)).toStrictEqual({ events: [event], asked: 2, waiting: 0 });
});

test.each([
  ["a failure", failed("Unavailable")],
  ["a method the Store lacks", UNKNOWN],
  ["a result that is no Heads", { kind: "result", result: { version: 4, seq: "5", comments: 2 } }],
] as const)("[HOST-8] a host that gets %s for heads does nothing and asks again", async (_name, answered) => {
  const served = await live();
  served.store.heads = answered;
  await tick(served);
  await tick(served);
  expect(served.hosts).toHaveLength(3);
  expect([served.events, served.views]).toStrictEqual([[], []]);
  expect(await probe(served.view)).toStrictEqual(PROBED);
});

test("[HOST-8] a host reports comments when their count differs from the last it saw, and not the first", async () => {
  const served = subject();
  await settle();
  expect(served.events).toStrictEqual([]);
  served.store.heads = heads({ comments: 3 });
  await tick(served);
  await tick(served);
  served.store.heads = heads({ comments: 1 });
  await tick(served);
  expect(served.events).toStrictEqual([{ kind: "comments", comments: 3 }, { kind: "comments", comments: 1 }]);
});

test("[HOST-8] [STATE-21] a host fetches the commits after its first heads and sends each to the view, in order", async () => {
  const served = await behind(commits(6, 7));
  expect(fetches(served)).toStrictEqual([fetch("page", 5)]);
  expect(served.views[0]).toMatchObject({ url: LINK, requestId: "host-4" });
  expect([await served.view.next(), await served.view.next()]).toStrictEqual([committed("page", 6), committed("page", 7)]);
});

test("[HOST-8] a host fetches from the last commit it sent, and nothing while the Store has no more", async () => {
  const served = await behind(commits(6), 8);
  await tick(served);
  served.store.heads = heads({ seq: 6 });
  await tick(served);
  expect(fetches(served)).toStrictEqual([fetch("page", 5), fetch("page", 6)]);
  expect(await served.view.next()).toStrictEqual(committed("page", 6));
  expect(await served.view.next()).toStrictEqual(committed("page", 6));
  expect(await probe(served.view)).toStrictEqual(PROBED);
});

test.each([
  ["fails", failed("Unavailable")],
  ["is not of the Store", UNKNOWN],
  ["is malformed", { kind: "result", result: { commits: [{ seq: 6 }], seq: 6 } }],
  ["is empty", commits()],
] as const)("[HOST-8] a host whose fetch of commits %s sends nothing and fetches from the same seq again", async (_name, answered) => {
  const served = await behind(answered);
  await tick(served);
  expect(fetches(served)).toStrictEqual([fetch("page", 5), fetch("page", 5)]);
  expect(await probe(served.view)).toStrictEqual(PROBED);
  expect(served.events).toStrictEqual([]);
});

test("[HOST-8] a host told to resync skips to the seq of its heads and leaves the resync to the view", async () => {
  const served = await behind(failed("ResyncRequired"));
  await tick(served);
  served.store.heads = heads({ seq: 8 });
  await tick(served);
  expect(fetches(served)).toStrictEqual([fetch("page", 5), fetch("page", 7)]);
  expect(await probe(served.view)).toStrictEqual(PROBED);
});

test("[STATE-21] a host sends the commits of the viewer scope from the first viewerSeq it saw", async () => {
  const served = await live();
  served.store.heads = heads({ viewerSeq: 2 });
  await tick(served);
  served.store.heads = heads({ viewerSeq: 3 });
  served.store.view = () => commits(3);
  await tick(served);
  expect(fetches(served)).toStrictEqual([fetch("viewer", 2)]);
  expect(await served.view.next()).toStrictEqual(committed("viewer", 3));
});

test("[STATE-21] a host follows both scopes, each from its own seq", async () => {
  const served = await live();
  served.store.heads = heads({ viewerSeq: 1 });
  await tick(served);
  served.store.heads = heads({ seq: 6, viewerSeq: 2 });
  served.store.view = commitsByScope(2);
  await tick(served);
  await tick(served);
  expect(fetches(served)).toStrictEqual([fetch("page", 5), fetch("viewer", 1)]);
  expect([await served.view.next(), await served.view.next()]).toStrictEqual([committed("page", 6), committed("viewer", 2)]);
});

test("[STATE-21] a host sends no commit to a view before it is initialized, and then those after its first heads", async () => {
  const served = subject();
  await settle();
  await commitSixth(served);
  expect(await sentToView(served)).toStrictEqual([[], PROBED]);
  await initialize(served.view);
  await tick(served);
  expect(fetches(served)).toStrictEqual([fetch("page", 5)]);
  expect(await served.view.next()).toStrictEqual(committed("page", 6));
});

const NOT_LIVE: [string, Capability][] = [
  ["liveChanges is false", { ...CAPABILITY, state: { maxDocumentBytes: 1024, maxOpsPerCommit: 10, maxTreeDepth: 4, liveChanges: false } }],
  ["it has no state", { version: CAPABILITY.version, limits: CAPABILITY.limits }],
];

test.each(NOT_LIVE)("[STATE-21] a host sends no commit when %s", async (_name, capability) => {
  const served = await live({ capability });
  await commitSixth(served);
  expect(await sentToView(served)).toStrictEqual([[], PROBED]);
});

test("[REL-23] a host keeps sending commits to a view that stopped answering pings", async () => {
  const served = await live();
  served.timers.advance(TIMEOUT_MS);
  await settle();
  await commitSixth(served);
  expect(served.events).toStrictEqual([{ kind: "unresponsive" }]);
  expect(await served.view.next()).toStrictEqual(committed("page", 6));
});

test("[REL-17] a host closed while it waits for heads reports nothing and asks no more", async () => {
  const slow = gate<Answer>();
  const served = subject();
  await settle();
  served.store.heads = slow.promise;
  await tick(served);
  await served.mounted.close();
  slow.open(heads({ version: 4 }));
  expect(await afterwards(served)).toStrictEqual({ events: [], asked: 2, waiting: 0 });
});

test("[REL-17] a host closed while it fetches commits sends none of them", async () => {
  const slow = gate<Answer>();
  const served = await behind(slow.promise);
  const closed = served.mounted.close();
  const teardown = await served.view.next();
  slow.open(commits(6, 7));
  await settle();
  expect(await probe(served.view)).toStrictEqual(PROBED);
  await answer(served.view, teardown);
  await expect(closed).resolves.toBeUndefined();
});
