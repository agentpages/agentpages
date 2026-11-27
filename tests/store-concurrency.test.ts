import { type Answer, TOOL_SCHEMAS } from "@agentpages/protocol";
import type { Storage } from "@agentpages/storage";
import * as fc from "fast-check";
import { expect, test } from "vitest";
import { BOB, call, declaring, errorOf, op, PAGE, PUBLISHED, publishing, readingAs, resultOf, world, type World } from "./support/store.ts";

type Request = [string, unknown];

const outcomeOf = (answer: Answer): string => errorOf(answer) ?? answer.kind;

/** How many answers had each outcome. */
const tally = (answers: Answer[]): Record<string, number> => {
  const outcomes = answers.map(outcomeOf);
  return Object.fromEntries(outcomes.map((outcome) => [outcome, outcomes.filter((other) => other === outcome).length]));
};

/**
 * Sends `requests` together to a new Store, in every order a scheduler finds for the steps of its storage, and
 * checks what they answered and what they left.
 */
const interleaving = (requests: Request[], check: (answers: Answer[], target: World) => Promise<void>): Promise<void> =>
  fc.assert(
    fc.asyncProperty(fc.scheduler(), async (scheduler) => {
      const target = world();
      target.plan((point) => scheduler.schedule(Promise.resolve(point)));
      const answers = await scheduler.waitFor(Promise.all(requests.map((request) => call(target, request))));
      target.plan(() => "go on");
      await check(answers, target);
    }),
    { numRuns: 40 },
  );

const versionsOf = async (target: World): Promise<number[]> =>
  resultOf(TOOL_SCHEMAS.pages_versions.result, await call(target, ["pages_versions", { pageId: PAGE }])).versions.map(
    (published) => published.version,
  );

const publishingFromNothing = [1, 2, 3].map((opNumber): Request => ["pages_publish", publishing({ page: 1, baseVersion: 0, op: opNumber })]);

test("[REL-2] copies of one request are applied once and get one answer, however they interleave", async () => {
  await interleaving([PUBLISHED, PUBLISHED, PUBLISHED], async (answers, target) => {
    expect(new Set(answers.map((answer) => JSON.stringify(answer))).size).toBe(1);
    expect(tally(answers)).toStrictEqual({ result: 3 });
    expect(await versionsOf(target)).toStrictEqual([1]);
  });
});

test("[PAGES-7] of the requests that publish from one version exactly one succeeds, however they interleave", async () => {
  await interleaving(publishingFromNothing, async (answers, target) => {
    expect(tally(answers)).toStrictEqual({ result: 1, Conflict: 2 });
    expect(await versionsOf(target)).toStrictEqual([1]);
  });
});

test("[TYPES-4] of the requests that publish a type from one version exactly one succeeds, however they interleave", async () => {
  const racing = [1, 2, 3].map((opNumber): Request => ["types_publish", declaring("deck", opNumber)]);

  await interleaving(racing, async (answers, target) => {
    const deck = await call(target, ["types_get", { typeId: "deck" }]);

    expect(tally(answers)).toStrictEqual({ result: 1, Conflict: 2 });
    expect(deck).toMatchObject({ result: { version: 1 } });
  });
});

interface Pair {
  held: Request;
  free: Request;
}

const share: Request = ["pages_set_access", { opId: op(5), pageId: PAGE, access: "link-read" }];

/** Requests on different pages or types, or on none. */
const INDEPENDENT: Pair[] = [
  { held: ["pages_publish", publishing({ page: 1, baseVersion: 1, op: 3 })], free: ["pages_publish", publishing({ page: 2, baseVersion: 0, op: 4 })] },
  { held: share, free: ["pages_list", {}] },
  { held: ["pages_list", {}], free: ["pages_list", {}] },
  { held: ["types_list", {}], free: ["pages_list", {}] },
  { held: ["types_publish", declaring("deck", 3)], free: ["types_publish", declaring("board", 4)] },
  { held: ["types_publish", declaring("deck", 3)], free: share },
  { held: share, free: ["types_get", { typeId: "sheet" }] },
];

/** Holds the first transaction that reaches the storage until the returned function is called. */
const holdingFirst = (target: World): (() => void) => {
  const releases: (() => void)[] = [];
  const waits = [
    new Promise<void>((resolve) => {
      releases.push(resolve);
    }),
  ];
  target.plan(() => waits.pop());
  return () => {
    releases.forEach((open) => {
      open();
    });
  };
};

test.each(INDEPENDENT)("a request does not wait for one on another page or type: $held.0 and $free.0", async ({ held, free }) => {
  const target = world();
  await call(target, PUBLISHED);
  await call(target, ["types_publish", declaring("sheet", 2)]);
  const release = holdingFirst(target);
  const waiting = call(target, held);
  const answered = await target.call({ tool: free[0], input: free[1], principal: BOB });
  release();

  expect(outcomeOf(answered)).toMatch(/^(?:result|Forbidden)$/u);
  expect(outcomeOf(await waiting)).toBe("result");
});

test("[REL-2] a request waits for the one before it on the same page", async () => {
  const target = world();
  const release = holdingFirst(target);
  const answers = publishingFromNothing.slice(1).map((request) => call(target, request));
  release();

  expect(tally(await Promise.all(answers))).toStrictEqual({ result: 1, Conflict: 1 });
});

/** `storage`, where `meanwhile` happens after every scan of a transaction, before the scan is answered. */
const afterEachScan = (storage: Storage, meanwhile: () => Promise<unknown>): Storage =>
  readingAs(storage, (tx) => ({
    scan: async (range) => {
      const rows = await tx.scan(range);
      await meanwhile();
      return rows;
    },
  }));

const pagesOf = async (target: World): Promise<string[]> =>
  resultOf(TOOL_SCHEMAS.pages_list.result, await call(target, ["pages_list", {}])).pages.map((page) => page.pageId);

test("[PAGES-3] pages_list answers from one read: a page deleted while it lists is listed whole or not at all", async () => {
  const target = world();
  await call(target, PUBLISHED);
  const deleted: Answer[] = [];
  const deleting = async (): Promise<number> => deleted.push(await call(target, ["pages_delete", { opId: op(2), pageId: PAGE }]));
  const listed = await pagesOf(world({ ports: { storage: afterEachScan(target.storage, deleting) } }));

  expect(listed).toStrictEqual([PAGE]);
  expect(deleted).toStrictEqual([{ kind: "result", result: {} }]);
  expect(await pagesOf(target)).toStrictEqual([]);
});
