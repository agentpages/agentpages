import type { Answer } from "@agentpages/protocol";
import { expect, test } from "vitest";
import { call, declaring, errorOf, op, PAGE, PUBLISHED, publishing, saved, uuid, world, type World } from "./support/store.ts";

interface Scenario {
  tool: string;
  /** What exists before the request. */
  before: [string, unknown][];
  input: unknown;
}

/** Every tool of this unit that changes anything, with a request that has an effect. */
const SCENARIOS: Scenario[] = [
  { tool: "pages_publish", before: [], input: publishing({ page: 1, baseVersion: 0, op: 2 }) },
  { tool: "pages_publish", before: [PUBLISHED], input: publishing({ page: 1, baseVersion: 1, op: 2 }) },
  { tool: "pages_set_access", before: [PUBLISHED], input: { opId: op(2), pageId: PAGE, access: "link-read" } },
  { tool: "pages_delete", before: [PUBLISHED], input: { opId: op(2), pageId: PAGE } },
  { tool: "types_publish", before: [], input: declaring("deck", 2) },
  { tool: "types_publish", before: [["types_publish", declaring("deck", 1)]], input: { ...declaring("deck", 2), baseVersion: 1 } },
];

/** A repeat draws the same secret as the request it repeats, so that what the two save can be compared. */
const ids = { id: (): string => "request", secret: (): string => "secret" };

const prepared = async ({ before }: Scenario): Promise<World> => {
  const target = world({ ports: { ids } });
  await before.reduce<Promise<unknown>>((earlier, request) => earlier.then(() => call(target, request)), Promise.resolve());
  return target;
};

/** What the request answers and leaves in the storage when nothing goes wrong. */
const undisturbed = async (scenario: Scenario): Promise<{ answer: Answer; effect: unknown }> => {
  const target = await prepared(scenario);
  const answer = await call(target, [scenario.tool, scenario.input]);
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
  const lost = await call(target, [scenario.tool, scenario.input]);
  const afterCrash = await saved(target.storage);
  target.restart();
  return { afterCrash, lost, target };
};

test.each(SCENARIOS)("[REL-7] $tool that crashes before its commit saves nothing, and its repeat is applied once", async (scenario) => {
  const expected = await undisturbed(scenario);
  const before = await saved((await prepared(scenario)).storage);
  const { afterCrash, lost, target } = await crashedAt("commit", scenario);
  const repeated = await call(target, [scenario.tool, scenario.input]);

  expect(lost).toStrictEqual(unavailable);
  expect(afterCrash).toStrictEqual(before);
  expect(repeated).toStrictEqual(expected.answer);
  expect(await saved(target.storage)).toStrictEqual(expected.effect);
  expect(expected.effect).not.toStrictEqual(before);
});

test.each(SCENARIOS)("[REL-2] $tool whose answer is lost after its commit is not applied again by its repeat", async (scenario) => {
  const expected = await undisturbed(scenario);
  const { afterCrash, lost, target } = await crashedAt("committed", scenario);
  const repeats = [await call(target, [scenario.tool, scenario.input]), await call(target, [scenario.tool, scenario.input])];

  expect(lost).toStrictEqual(unavailable);
  expect(afterCrash).toStrictEqual(expected.effect);
  expect(repeats).toStrictEqual([expected.answer, expected.answer]);
  expect(await saved(target.storage)).toStrictEqual(expected.effect);
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
  ];
  const answers = await Promise.all(refused.map((request) => call(target, request)));
  const strangers: Answer = await target.call({ tool: "pages_delete", input: { opId: op(10), pageId: PAGE }, principal: { kind: "agent", subject: "bob" } });

  expect([...answers, strangers].map((answer) => errorOf(answer))).toStrictEqual(
    ["Conflict", "LimitExceeded", "NotFound", "NotFound", "InvalidParams", "Conflict", "InvalidParams", "Forbidden"],
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
