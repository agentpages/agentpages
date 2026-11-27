import { TOOL_SCHEMAS } from "@agentpages/protocol";
import type { Storage } from "@agentpages/storage";
import { expect, test } from "vitest";
import { savedRows, seqOf } from "./support/results.ts";
import { ADVERTISED, call, callEach, committed, committing, declaring, errorOf, op, PAGE, PUBLISHED, publishing, resultOf, saved, uuid, world, type World } from "./support/store.ts";

const { opRetentionSeconds, commitRetentionSeconds, requestTimeoutMs } = ADVERTISED.limits;

/** How long a Store keeps what it remembers of a request before a sweep deletes it. */
const OP_KEPT_MS: number = opRetentionSeconds * 1000 + requestTimeoutMs;

/** How long a Store keeps a commit before a sweep deletes it. */
const COMMIT_KEPT_MS: number = commitRetentionSeconds * 1000 + requestTimeoutMs;

type Request = [string, unknown];

const EMPTY_COMMIT: Request = committed(2, []);

const OTHER_PAGE: Request = ["pages_publish", publishing({ page: 2, baseVersion: 0, op: 3 })];

/** What `commits` answers alice after `since`: the `seq` of each commit and of the head, or the error. */
const following = async (target: World, since: number): Promise<unknown> => {
  const answer = await call(target, ["state_commits", { pageId: PAGE, scope: "page", since }]);
  if (answer.kind !== "result") return errorOf(answer);
  const { commits, seq } = resultOf(TOOL_SCHEMAS.state_commits.result, answer);
  return [commits.map((commit) => commit.seq), seq];
};

const followingEach = (target: World): Promise<unknown[]> => Promise.all([0, 1, 2].map((since) => following(target, since)));

test("[REL-4] a record inside retention survives a sweep, and one that is requestTimeoutMs past it is forgotten", async () => {
  const target = world();
  await callEach(target, [PUBLISHED, EMPTY_COMMIT]);
  target.driver.advance(OP_KEPT_MS);
  const early = [await target.sweep(100), await seqOf(call(target, EMPTY_COMMIT))];
  target.driver.advance(1);
  const late = [await target.sweep(100), await seqOf(call(target, EMPTY_COMMIT))];

  expect([early, late]).toStrictEqual([[0, 1], [2, 2]]);
});

test("[STATE-20] commits inside retention are served after a sweep, and a since before a swept commit is ResyncRequired", async () => {
  const target = world();
  await callEach(target, [PUBLISHED, EMPTY_COMMIT]);
  target.driver.advance(requestTimeoutMs + 1);
  await call(target, committed(3, []));
  target.driver.advance(commitRetentionSeconds * 1000);
  const first = [await target.sweep(100), await followingEach(target)];
  target.driver.advance(COMMIT_KEPT_MS);
  const second = [await target.sweep(100), await followingEach(target)];

  expect(first).toStrictEqual([4, ["ResyncRequired", [[2], 2], [[], 2]]]);
  expect(second).toStrictEqual([1, ["ResyncRequired", "ResyncRequired", [[], 2]]]);
  expect(await target.sweep(100)).toBe(0);
});

test("[STATE-20] a since before a commit that was swept between two that are kept, after the clock went back, is ResyncRequired", async () => {
  const target = world();
  await call(target, PUBLISHED);
  target.driver.advance(40_000);
  await call(target, committed(2, []));
  target.driver.advance(-80_000);
  await call(target, committed(3, []));
  target.driver.advance(90_000);
  await call(target, committed(4, []));
  target.driver.advance(COMMIT_KEPT_MS + 1 - 90_000);

  expect([await target.sweep(100), await followingEach(target)]).toStrictEqual([5, ["ResyncRequired", "ResyncRequired", [[3], 3]]]);
});

test("a sweep clears no more than its limit of remembered requests, and no more than its limit of commits", async () => {
  const target = world();
  await callEach(target, [PUBLISHED, EMPTY_COMMIT, committed(3, [])]);
  target.driver.advance(COMMIT_KEPT_MS + 1);

  expect([await target.sweep(1), await target.sweep(2), await target.sweep(2)]).toStrictEqual([2, 3, 0]);
});

test.each([0, -1, Number.NaN, 1.5, Number.MAX_SAFE_INTEGER + 1])("a sweep with the limit %d throws", (limit) => {
  const target = world();

  expect(() => target.sweep(limit)).toThrow(new RangeError("limit must be a positive safe integer."));
});

/** A page that was deleted after three commits, and another page with one. */
const HISTORY: Request[] = [
  PUBLISHED,
  EMPTY_COMMIT,
  committed(3, []),
  committed(4, []),
  ["pages_delete", { opId: op(5), pageId: PAGE }],
  ["pages_publish", publishing({ page: 2, baseVersion: 0, op: 6 })],
  ["state_commit", { pageId: uuid(2), ...committing(7, []) }],
];

/** What sweeps with `limit` resolve with, one after the other until one finds nothing. */
const drained = async (target: World, limit: number): Promise<number[]> => {
  const cleared = await target.sweep(limit);
  return cleared === 0 ? [] : [cleared, ...(await drained(target, limit))];
};

const total = (counts: number[]): number => counts.reduce((sum, count) => sum + count, 0);

test("sweeps with a small limit until one resolves with 0 leave what one large sweep leaves, also after a page was deleted", async () => {
  const [small, large] = [world(), world()];
  await callEach(small, HISTORY);
  await callEach(large, HISTORY);
  small.driver.advance(COMMIT_KEPT_MS + 1);
  large.driver.advance(COMMIT_KEPT_MS + 1);
  const [bySmall, byLarge] = [await drained(small, 2), await large.sweep(100)];

  expect([total(bySmall), Math.max(...bySmall), byLarge]).toStrictEqual([11, 4, 11]);
  expect(await saved(small.storage)).toStrictEqual(await saved(large.storage));
});

interface Signal {
  sent: Promise<void>;
  send: () => void;
}

const signal = (): Signal => {
  const sends: (() => void)[] = [];
  const sent = new Promise<void>((resolve) => {
    sends.push(resolve);
  });
  return {
    sent,
    send: () => {
      sends.forEach((send) => {
        send();
      });
    },
  };
};

/** Holds the storage of `target` at its scan number `n`. Resolves when the storage waits there, with what lets it go on. */
const heldAtScan = async (target: World, n: number): Promise<() => void> => {
  const [scans, reached, released] = [{ made: 0 }, signal(), signal()];
  const hold = (): Promise<void> => {
    reached.send();
    return released.sent;
  };
  target.plan((point) => {
    scans.made += Number(point === "scan");
    return point === "scan" && scans.made === n ? hold() : undefined;
  });
  await reached.sent;
  return released.send;
};

test("[REL-2] a sweep held between its scan and its lock does not delete a record re-created under the same opId", async () => {
  const target = world();
  await callEach(target, [PUBLISHED, EMPTY_COMMIT]);
  target.driver.advance(OP_KEPT_MS + 1);
  const held = heldAtScan(target, 2);
  const stale = target.sweep(100);
  const release = await held;
  const swept = await target.sweep(100);
  const again = await seqOf(call(target, EMPTY_COMMIT));
  release();

  expect([swept, again, await stale, await seqOf(call(target, EMPTY_COMMIT))]).toStrictEqual([2, 2, 0, 2]);
});

test("[REL-4] a sweep does not forget a request that is remembered where a page delete removed an older one with the same opId", async () => {
  const target = world();
  await callEach(target, [PUBLISHED, ["pages_delete", { opId: op(2), pageId: PAGE }]]);
  target.driver.advance(1);
  await call(target, ["pages_delete", { opId: op(1), pageId: PAGE }]);
  target.driver.advance(OP_KEPT_MS);
  const early = [await target.sweep(100), await savedRows(target.storage)];
  target.driver.advance(1);

  expect(early).toStrictEqual([2, [[`gone/${PAGE}`, {}], [expect.stringContaining(op(1)), expect.objectContaining({ result: {} })]]]);
  expect([await target.sweep(100), await saved(target.storage)]).toStrictEqual([1, [[`gone/${PAGE}`, {}]]]);
});

/** Makes the storage of `target` crash at its commit number `n`. */
const crashingAtCommit = (target: World, n: number): void => {
  const commits = { made: 0 };
  target.plan((point) => {
    commits.made += Number(point === "commit");
    if (point === "commit" && commits.made === n) throw new Error("The storage crashed.");
  });
};

test("[REL-4] a sweep that fails at commit deletes the rest when called again", async () => {
  const target = world();
  await callEach(target, [PUBLISHED, OTHER_PAGE, ["types_publish", declaring("deck", 4)]]);
  target.driver.advance(OP_KEPT_MS + 1);
  crashingAtCommit(target, 2);
  const failed = await target.sweep(100).catch((error: unknown) => error);

  expect([failed, await target.sweep(100), await target.sweep(100)]).toStrictEqual([new Error("The storage crashed."), 2, 0]);
});

interface Held {
  /** Resolves when the sweep has saved what it does under the lock that is free. */
  swept: Promise<void>;
  release: () => void;
}

/** Holds the first transaction under the lock `held` at its first read. Resolves when it waits there. */
const holding = async (target: World, { held, free }: { held: string; free: string }): Promise<Held> => {
  const [reached, released, swept] = [signal(), signal(), signal()];
  const waits = [released.sent];
  const hold = (): Promise<void> | undefined => {
    reached.send();
    return waits.pop();
  };
  target.plan((point, { locks }) => {
    if (point === "committed" && locks.includes(free)) swept.send();
    return point !== "committed" && locks.includes(held) ? hold() : undefined;
  });
  await reached.sent;
  return { swept: swept.sent, release: released.send };
};

test("a sweep clears what one page remembers while a request holds the lock of another page, whose records it leaves until the request is done", async () => {
  const target = world();
  await callEach(target, [PUBLISHED, EMPTY_COMMIT, OTHER_PAGE]);
  target.driver.advance(OP_KEPT_MS + 1);
  const waiting = holding(target, { held: `page/${uuid(2)}/meta`, free: `page/${PAGE}/meta` });
  const repeat = call(target, OTHER_PAGE);
  const { swept, release } = await waiting;
  const sweep = target.sweep(100);
  await swept;
  const applied = await seqOf(call(target, EMPTY_COMMIT));
  release();

  expect([applied, (await repeat).kind, await sweep, errorOf(await call(target, OTHER_PAGE))]).toStrictEqual([2, "result", 3, "Conflict"]);
});

/** `storage`, whose scans outside a transaction return rows the Store never wrote. */
const damaging = (storage: Storage): Storage => ({
  ...storage,
  scan: async (range) => (await storage.scan(range)).map(([key]) => [key, {}]),
});

test("a sweep that reads a note the storage damaged fails, and deletes nothing", async () => {
  const target = world({ ports: { storage: damaging(world().storage) } });
  await call(target, PUBLISHED);
  target.driver.advance(OP_KEPT_MS + 1);

  await expect(target.sweep(100)).rejects.toMatchObject({ name: "CorruptRecord" });
  expect((await call(target, PUBLISHED)).kind).toBe("result");
});
