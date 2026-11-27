import type { Answer } from "@agentpages/protocol";
import { expect, test } from "vitest";
import { ask, BASE_URL, call, callEach, COMMIT, committed, committing, declaring, errorOf, node, op, PAGE, PUBLISHED, publishing, put, remove, saved, TREE_PAGE, TYPED_PAGE, uuid, world, type World } from "./support/store.ts";

interface Scenario {
  tool: string;
  /** What exists before the request. */
  before: [string, unknown][];
  input: unknown;
  /** Who asks, when the request is a method of the view that shows `PAGE` and not a tool call of alice. */
  viewer?: string;
}

type Request = [string, unknown];

const SHARED: Request[] = [PUBLISHED, ["pages_set_access", { opId: op(9), pageId: PAGE, access: "link-write" }]];

const TYPED_COMMIT: Scenario = { tool: "state_commit", before: TYPED_PAGE, input: committed(2, [put("a")])[1] };

/** Two trees: a chain of three tasks, and a task under another. */
const GROWN: Request[] = [...TREE_PAGE, committed(3, [node("a", null), node("b", "a"), node("c", "b"), node("d", null), node("e", "d")])];

/** A commit that deletes one tree with its descendants and puts a task into the other. */
const TREE_COMMIT: Scenario = { tool: "state_commit", before: GROWN, input: committed(2, [remove("a"), node("f", "e")])[1] };

/** A put of the file `a`, of three bytes. */
const FILE = { opId: op(2), id: "a", name: "a.bin", mimeType: "application/octet-stream", blob: "AP8H" };

/** Every tool of this unit that changes anything, with a request that has an effect. */
const SCENARIOS: Scenario[] = [
  { tool: "pages_publish", before: [], input: publishing({ page: 1, baseVersion: 0, op: 2 }) },
  { tool: "pages_publish", before: [PUBLISHED], input: publishing({ page: 1, baseVersion: 1, op: 2 }) },
  { tool: "pages_set_access", before: [PUBLISHED], input: { opId: op(2), pageId: PAGE, access: "link-read" } },
  { tool: "pages_delete", before: [PUBLISHED], input: { opId: op(2), pageId: PAGE } },
  { tool: "types_publish", before: [], input: declaring("deck", 2) },
  { tool: "types_publish", before: [["types_publish", declaring("deck", 1)]], input: { ...declaring("deck", 2), baseVersion: 1 } },
  { tool: "state_commit", before: [PUBLISHED], input: committed(2, [put("a")])[1] },
  { tool: "state_commit", before: [PUBLISHED, committed(3, [put("a"), put("b")])], input: committed(2, [{ op: "delete", collection: "tasks", id: "a" }, put("b", { n: 2 })])[1] },
  TYPED_COMMIT,
  TREE_COMMIT,
  { tool: COMMIT, viewer: "bob", before: SHARED, input: committing(2, [put("a")]) },
  { tool: COMMIT, viewer: "bob", before: SHARED, input: { ...committing(2, [put("a")]), scope: "viewer" } },
  { tool: "files_put", before: [PUBLISHED], input: { pageId: PAGE, ...FILE } },
  { tool: "files_delete", before: [PUBLISHED, ["files_put", { pageId: PAGE, ...FILE, opId: op(3) }]], input: { opId: op(2), pageId: PAGE, id: "a" } },
  { tool: "agentpages/files/put", viewer: "bob", before: SHARED, input: FILE },
];

/** The link of `PAGE` in a Store whose every secret is the same. */
const LINK = `${BASE_URL}${PAGE}/secret`;

const send = (target: World, { tool, input, viewer }: Scenario): Promise<Answer> =>
  viewer === undefined ? call(target, [tool, input]) : ask(target, { url: LINK, subject: viewer, method: tool, params: input });

/** A repeat draws the same secret as the request it repeats, so that what the two save can be compared. */
const ids = { id: (): string => "request", secret: (): string => "secret" };

const prepared = async ({ before }: Scenario): Promise<World> => {
  const target = world({ ports: { ids } });
  await callEach(target, before);
  return target;
};

/** What the request answers and leaves in the storage when nothing goes wrong. */
const undisturbed = async (scenario: Scenario): Promise<{ answer: Answer; effect: unknown }> => {
  const target = await prepared(scenario);
  const answer = await send(target, scenario);
  return { answer, effect: await saved(target.storage) };
};

const unavailable = {
  kind: "failure",
  failure: { error: "Unavailable", retryable: true, requestId: expect.any(String) as unknown, message: "The storage did not answer. Repeat the request with the same opId." },
};

interface Crash {
  /** What the storage held when the request was answered. */
  afterCrash: unknown;
  lost: Answer;
  target: World;
}

/** Sends the request of `scenario` to a Store whose storage crashes at `point`, then restarts the Store. */
const crashedAt = async (point: "commit" | "committed", scenario: Scenario): Promise<Crash> => {
  const target = await prepared(scenario);
  target.failAt(point);
  const lost = await send(target, scenario);
  const afterCrash = await saved(target.storage);
  target.restart();
  return { afterCrash, lost, target };
};

test.each(SCENARIOS)("[REL-7] $tool that crashes before its commit saves nothing, and its repeat is applied once", async (scenario) => {
  const expected = await undisturbed(scenario);
  const before = await saved((await prepared(scenario)).storage);
  const { afterCrash, lost, target } = await crashedAt("commit", scenario);
  const repeated = await send(target, scenario);

  expect(lost).toStrictEqual(unavailable);
  expect(afterCrash).toStrictEqual(before);
  expect(repeated).toStrictEqual(expected.answer);
  expect(await saved(target.storage)).toStrictEqual(expected.effect);
  expect(expected.effect).not.toStrictEqual(before);
});

test.each(SCENARIOS)("[REL-2] $tool whose answer is lost after its commit is not applied again by its repeat", async (scenario) => {
  const expected = await undisturbed(scenario);
  const { afterCrash, lost, target } = await crashedAt("committed", scenario);
  const repeats = [await send(target, scenario), await send(target, scenario)];

  expect(lost).toStrictEqual(unavailable);
  expect(afterCrash).toStrictEqual(expected.effect);
  expect(repeats).toStrictEqual([expected.answer, expected.answer]);
  expect(await saved(target.storage)).toStrictEqual(expected.effect);
});

const READS = new Set(["get", "getMany", "scan"]);

interface Lost {
  /** Whether the request made that many reads, so that one was lost. */
  reached: boolean;
  held: boolean[];
}

/** Sends the request of `scenario` to a Store that loses read number `n` of a transaction, then sends it again. */
const losingRead = async (scenario: Scenario, n: number): Promise<Lost> => {
  const [expected, target] = [await undisturbed(scenario), await prepared(scenario)];
  const [before, reads] = [await saved(target.storage), { made: 0 }];
  target.plan((point, { locks }) => {
    reads.made += Number(READS.has(point) && locks.length > 0);
    if (reads.made === n) throw new Error(`The storage lost read ${reads.made}.`);
  });
  const lost = errorOf(await send(target, scenario)) === "Unavailable";
  const unchanged = JSON.stringify(await saved(target.storage)) === JSON.stringify(before);
  reads.made = Number.NaN;
  const repeated = JSON.stringify(await send(target, scenario)) === JSON.stringify(expected.answer);
  return { reached: lost, held: [unchanged, repeated, JSON.stringify(await saved(target.storage)) === JSON.stringify(expected.effect)] };
};

const READ_NUMBERS = Array.from({ length: 32 }, (_, n) => n + 1);

/** What losing each read of a commit in turn comes to, for the reads the commit makes. */
const lostReads = async (scenario: Scenario): Promise<Lost[]> => {
  const attempts = await Promise.all(READ_NUMBERS.map((n) => losingRead(scenario, n)));
  const reads = attempts.findIndex((attempt) => !attempt.reached);

  expect(attempts.slice(reads).map((attempt) => attempt.reached)).toStrictEqual(attempts.slice(reads).map(() => false));
  return attempts.slice(0, reads);
};

test("[REL-8] a commit that loses any one of the reads it makes is unavailable and changes nothing, and its repeat is applied once", async () => {
  const [typed, tree] = [await lostReads(TYPED_COMMIT), await lostReads(TREE_COMMIT)];
  const lost = [...typed, ...tree];

  expect(typed).toHaveLength(5);
  expect(tree.length).toBeGreaterThan(typed.length);
  expect(lost.map((attempt) => attempt.held)).toStrictEqual(lost.map(() => [true, true, true]));
});

/** Runs `record` every time the storage reaches `point`. */
const recordingAt =
  (point: string, record: () => Promise<unknown>) =>
  (reached: string): Promise<unknown> =>
    reached === point ? record() : Promise.resolve();

test("[REL-6] a change is saved before the Store answers it with success", async () => {
  const target = world();
  const seen: unknown[] = [];
  target.plan(recordingAt("committed", async () => seen.push(await target.storage.get(`page/${PAGE}/meta`))));
  const answer = await call(target, PUBLISHED);

  expect(seen).toStrictEqual([expect.objectContaining({ pageId: PAGE, version: 1, owner: "alice" })]);
  expect(answer.kind).toBe("result");
});

test("[REL-8] a request the Store refuses saves nothing", async () => {
  const target = await prepared({ tool: "", before: [PUBLISHED, ["types_publish", declaring("deck", 3)]], input: {} });
  const before = await saved(target.storage);
  const refused: [string, unknown][] = [
    ["pages_publish", publishing({ page: 1, baseVersion: 0, op: 4 })],
    ["pages_publish", { ...publishing({ page: 1, baseVersion: 1, op: 5 }), content: { kind: "html", html: "é".repeat(201) } }],
    ["pages_publish", { ...publishing({ page: 2, baseVersion: 0, op: 6 }), content: { kind: "type", typeId: "deck", typeVersion: 2 } }],
    ["pages_set_access", { opId: op(7), pageId: uuid(2), access: "link-read" }],
    ["pages_publish", { ...publishing({ page: 1, baseVersion: 1, op: 1 }) }],
    ["types_publish", declaring("deck", 8)],
    ["types_publish", { ...declaring("deck", 9), baseVersion: 1, collections: { tasks: { schema: { type: 7 } } } }],
    committed(11, [put("a"), { ...put("b"), ifRevision: 1 }]),
    committed(12, [put("a", { text: "é".repeat(600) })]),
    ["state_commits", { pageId: PAGE, scope: "page", since: 1 }],
  ];
  const answers = await Promise.all(refused.map((request) => call(target, request)));
  const strangers: Answer = await target.call({ tool: "pages_delete", input: { opId: op(10), pageId: PAGE }, principal: { kind: "agent", subject: "bob" } });

  expect([...answers, strangers].map((answer) => errorOf(answer))).toStrictEqual(
    ["Conflict", "LimitExceeded", "NotFound", "NotFound", "InvalidParams", "Conflict", "InvalidParams", "Conflict", "LimitExceeded", "InvalidParams", "Forbidden"],
  );
  expect(await saved(target.storage)).toStrictEqual(before);
});

test.each([
  { point: "get", request: ["pages_get", { pageId: PAGE }] },
  { point: "scan", request: ["pages_list", {}] },
  { point: "getMany", request: ["pages_publish", publishing({ page: 1, baseVersion: 1, op: 2 })] },
  { point: "get", request: ["types_publish", declaring("deck", 2)] },
] as const)("a storage that fails at $point makes $request.0 unavailable, and changes nothing", async ({ point, request }) => {
  const target = await prepared({ tool: "", before: [PUBLISHED], input: {} });
  const before = await saved(target.storage);
  target.failAt(point);
  const lost = await call(target, [...request]);

  expect(lost).toStrictEqual(unavailable);
  expect(await saved(target.storage)).toStrictEqual(before);
  expect((await call(target, [...request])).kind).toBe("result");
});
