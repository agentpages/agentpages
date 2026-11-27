import { type Answer, TOOL_SCHEMAS } from "@agentpages/protocol";
import type { Storage } from "@agentpages/storage";
import * as fc from "fast-check";
import { expect, test } from "vitest";
import { BOB, call, callEach, committed, declaring, errorOf, node, op, PAGE, PUBLISHED, publishing, put, transactingAs, resultOf, saved, TREE_PAGE, TYPED_PAGE, world, type World } from "./support/store.ts";

type Request = [string, unknown];

const outcomeOf = (answer: Answer): string => errorOf(answer) ?? answer.kind;

/** How many answers had each outcome. */
const tally = (answers: Answer[]): Record<string, number> => {
  const outcomes = answers.map(outcomeOf);
  return Object.fromEntries(outcomes.map((outcome) => [outcome, outcomes.filter((other) => other === outcome).length]));
};

interface Racing {
  /** What is sent first, one request after the other. */
  before: Request[];
  /** What is then sent together. */
  together: Request[];
}

/**
 * Sends requests together to a new Store, in every order a scheduler finds for the steps of its storage, and checks
 * what they answered and what they left.
 */
const interleaving = ({ before, together }: Racing, check: (answers: Answer[], target: World) => Promise<void>): Promise<void> =>
  fc.assert(
    fc.asyncProperty(fc.scheduler(), async (scheduler) => {
      const target = world();
      await callEach(target, before);
      target.plan((point) => scheduler.schedule(Promise.resolve(point)));
      const answers = await scheduler.waitFor(Promise.all(together.map((request) => call(target, request))));
      target.plan(() => "go on");
      await check(answers, target);
    }),
    { numRuns: 40, seed: 2026 },
  );

const versionsOf = async (target: World): Promise<number[]> =>
  resultOf(TOOL_SCHEMAS.pages_versions.result, await call(target, ["pages_versions", { pageId: PAGE }])).versions.map(
    (published) => published.version,
  );

const publishingFromNothing = [1, 2, 3].map((opNumber): Request => ["pages_publish", publishing({ page: 1, baseVersion: 0, op: opNumber })]);

test("[REL-2] copies of one request are applied once and get one answer, however they interleave", async () => {
  await interleaving({ before: [], together: [PUBLISHED, PUBLISHED, PUBLISHED] }, async (answers, target) => {
    expect(new Set(answers.map((answer) => JSON.stringify(answer))).size).toBe(1);
    expect(tally(answers)).toStrictEqual({ result: 3 });
    expect(await versionsOf(target)).toStrictEqual([1]);
  });
});

test("[PAGES-7] of the requests that publish from one version exactly one succeeds, however they interleave", async () => {
  await interleaving({ before: [], together: publishingFromNothing }, async (answers, target) => {
    expect(tally(answers)).toStrictEqual({ result: 1, Conflict: 2 });
    expect(await versionsOf(target)).toStrictEqual([1]);
  });
});

test("[TYPES-4] of the requests that publish a type from one version exactly one succeeds, however they interleave", async () => {
  const racing = [1, 2, 3].map((opNumber): Request => ["types_publish", declaring("deck", opNumber)]);

  await interleaving({ before: [], together: racing }, async (answers, target) => {
    const deck = await call(target, ["types_get", { typeId: "deck" }]);

    expect(tally(answers)).toStrictEqual({ result: 1, Conflict: 2 });
    expect(deck).toMatchObject({ result: { version: 1 } });
  });
});

const expectingNone = [3, 4, 5].map((opNumber): Request => committed(opNumber, [{ ...put("a"), ifRevision: 0 }]));

test("[STATE-17] of the commits that expect one revision of a document exactly one succeeds, however they interleave", async () => {
  await interleaving({ before: [PUBLISHED], together: expectingNone }, async (answers, target) => {
    const listed = resultOf(TOOL_SCHEMAS.state_list.result, await call(target, LIST));

    expect(tally(answers)).toStrictEqual({ result: 1, Conflict: 2 });
    expect([listed.seq, listed.documents.map((document) => document.revision)]).toStrictEqual([1, [1]]);
  });
});

const LIST: Request = ["state_list", { pageId: PAGE, scope: "page", collection: "tasks" }];

const GROWN: Request[] = [...TREE_PAGE, committed(3, [node("parent", null)])];

const felling: Request = committed(4, [{ op: "delete", collection: "tasks", id: "parent" }]);

const grafting: Request = committed(5, [node("child", "parent")]);

/** The error of a commit, or the ids of the documents it changed. */
const changedOrError = (answer: Answer): unknown =>
  errorOf(answer) ?? resultOf(TOOL_SCHEMAS.state_commit.result, answer).commit.changes.map((change) => change.id);

test.each([
  { together: [felling, grafting], answered: [["parent"], "Conflict"], seq: 2 },
  { together: [grafting, felling], answered: [["child"], ["parent", "child"]], seq: 3 },
])("[TREE-4] a delete of a parent and a put of a child under it, each valid alone, end as one after the other does: $together.0.1.opId first", async ({ together, answered, seq }) => {
  await interleaving({ before: GROWN, together }, async (answers, target) => {
    const listed = resultOf(TOOL_SCHEMAS.state_list.result, await call(target, LIST));
    await call(target, committed(6, [node("parent", null)]));
    const again = changedOrError(await call(target, committed(7, [{ op: "delete", collection: "tasks", id: "parent" }])));

    expect([answers.map(changedOrError), listed.seq, listed.documents, again]).toStrictEqual([answered, seq, [], ["parent"]]);
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

/** Sends one request, holds it in its transaction, sends the other behind it, and returns how the two ended. */
const oneAfterTheOther = async (target: World, [first, second]: [Request, Request]): Promise<string[]> => {
  const release = holdingFirst(target);
  const answers = [call(target, first), call(target, second)];
  release();
  return (await Promise.all(answers)).map(outcomeOf);
};

const remove: Request = ["pages_delete", { opId: op(6), pageId: PAGE }];

test.each([
  { first: committed(3, [put("a")]), second: remove, outcomes: ["result", "result"] },
  { first: remove, second: committed(3, [put("a")]), outcomes: ["result", "NotFound"] },
])("[PAGES-6] a commit and a pages_delete of its page leave no state of the page, whichever comes first: $first.0", async ({ first, second, outcomes }) => {
  const target = world();
  await call(target, PUBLISHED);

  expect(await oneAfterTheOther(target, [first, second])).toStrictEqual(outcomes);
  expect(await saved(target.storage)).toStrictEqual([
    [`gone/${PAGE}`, {}],
    [expect.stringContaining(op(6)), expect.objectContaining({ result: {} })],
  ]);
});

/** A second version of the type of `PAGE`, which asks more of a task than the first. */
const stricter: Request = ["types_publish", { ...declaring("deck", 7), baseVersion: 1, collections: { tasks: { schema: { required: ["done"] } } } }];

const moved: Request = ["pages_publish", { ...publishing({ page: 1, baseVersion: 1, op: 2 }), content: { kind: "type", typeId: "deck", typeVersion: 2 } }];

test.each([
  { first: committed(3, [put("a")]), second: moved, outcomes: ["result", "result"], seq: 1 },
  { first: moved, second: committed(3, [put("a")]), outcomes: ["result", "InvalidParams"], seq: 0 },
])("[TYPES-9] a commit is checked by the type version its page names when its turn comes: $first.0 first", async ({ first, second, outcomes, seq }) => {
  const target = world();
  await callEach(target, [...TYPED_PAGE, stricter]);

  expect(await oneAfterTheOther(target, [first, second])).toStrictEqual(outcomes);
  expect(resultOf(TOOL_SCHEMAS.state_list.result, await call(target, LIST)).seq).toBe(seq);
});

test("[STATE-18] a list waits for the commit before it on its page, and answers with all of it", async () => {
  const target = world();
  await call(target, PUBLISHED);
  const release = holdingFirst(target);
  const [committing, listing] = [call(target, committed(3, [put("a"), put("b")])), call(target, LIST)];
  release();
  const listed = resultOf(TOOL_SCHEMAS.state_list.result, await listing);

  expect([listed.seq, listed.documents.map((document) => document.id)]).toStrictEqual([1, ["a", "b"]]);
  expect(outcomeOf(await committing)).toBe("result");
});

/** `storage`, where `meanwhile` happens after every scan of a transaction, before the scan is answered. */
const afterEachScan = (storage: Storage, meanwhile: () => Promise<unknown>): Storage =>
  transactingAs(storage, (tx) => ({
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
