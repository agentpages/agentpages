import { ajvSchemaCompiler, type Ports } from "@agentpages/server";
import { expect, test } from "vitest";
import { ADVERTISED, call, callEach, declaring, errorOf, inTurn, op, publishing, put, uuid, world, type World } from "./support/store.ts";

/** How many compiled schemas a Store keeps. */
const KEPT = 1024;

interface Counting {
  compiler: Ports["compiler"];
  /** Every schema the Store had compiled, oldest first. */
  compiled: unknown[];
}

/** A compiler that notes what it is asked to compile, and has `inner` do it. */
const counting = (inner: Ports["compiler"]): Counting => {
  const compiled: unknown[] = [];
  return {
    compiled,
    compiler: {
      compile: (schema) => {
        compiled.push(schema);
        return inner.compile(schema);
      },
    },
  };
};

/** A Store whose compiler is `inner`, after these requests of alice, and what it had compiled since. */
const after = async (requests: [string, unknown][], inner: Ports["compiler"] = ajvSchemaCompiler): Promise<{ target: World; compiled: unknown[] }> => {
  const { compiler, compiled } = counting(inner);
  const target = world({ ports: { compiler }, config: { capability: { limits: ADVERTISED.limits, state: { maxDocumentBytes: 1024, maxOpsPerCommit: KEPT, maxTreeDepth: 4, liveChanges: true } } } });
  await callEach(target, requests);
  compiled.length = 0;
  return { target, compiled };
};

const TITLED = { required: ["title"] };
const NUMBERED = { required: ["n"] };
const DONE = { required: ["done"] };

const typedPage = (page: number, content: { typeId: string; typeVersion: number }): [string, unknown] => [
  "pages_publish",
  { ...publishing({ page, baseVersion: 0, op: page }), content: { kind: "type", ...content } },
];

/** A commit of alice's to page `page`, and the error it failed with. */
const commitTo = async (target: World, [page, opNumber, ops]: [number, number, unknown[]]): Promise<string | undefined> =>
  errorOf(await call(target, ["state_commit", { pageId: uuid(page), scope: "page", opId: op(opNumber), ops }]));

const inNotes = (id: string, data: Record<string, unknown> = {}): Record<string, unknown> => ({ ...put(id, data), collection: "notes" });

test("a commit to a typed page compiles the schema of each collection its puts name, the first time one names it", async () => {
  const { target, compiled } = await after([
    ["types_publish", { ...declaring("deck", 10), collections: { tasks: { schema: TITLED }, notes: { schema: NUMBERED }, never: { schema: DONE } } }],
    typedPage(1, { typeId: "deck", typeVersion: 1 }),
  ]);
  const errors = [
    await commitTo(target, [1, 20, [put("a", { title: "Plan" })]]),
    await commitTo(target, [1, 21, [put("b", { title: "Plan" }), { op: "delete", collection: "notes", id: "a" }, { op: "delete", collection: "never", id: "a" }]]),
    await commitTo(target, [1, 22, [put("c", { n: 1 })]]),
  ];
  const afterTasks = [...compiled];
  errors.push(await commitTo(target, [1, 23, [inNotes("a", { n: 1 }), put("d", { title: "Plan" })]]), await commitTo(target, [1, 24, [inNotes("b")]]));
  target.restart();
  const afterRestart = await commitTo(target, [1, 25, [put("e", { title: "Plan" })]]);

  expect([errors, afterRestart]).toStrictEqual([[undefined, undefined, "InvalidParams", undefined, "InvalidParams"], undefined]);
  expect([afterTasks, compiled]).toStrictEqual([[TITLED], [TITLED, NUMBERED, TITLED]]);
});

test("a compiled schema is that of one collection of one version of one type", async () => {
  const { target, compiled } = await after([
    ["types_publish", { ...declaring("deck", 10), collections: { tasks: { schema: TITLED } } }],
    ["types_publish", { ...declaring("deck", 11), baseVersion: 1, collections: { tasks: { schema: NUMBERED } } }],
    ["types_publish", { ...declaring("board", 12), collections: { tasks: { schema: DONE } } }],
    typedPage(1, { typeId: "deck", typeVersion: 1 }),
    typedPage(2, { typeId: "deck", typeVersion: 2 }),
    typedPage(3, { typeId: "board", typeVersion: 1 }),
  ]);
  const data = [{ title: "Plan" }, { n: 1 }, { done: true }];
  const turns = [1, 2, 3, 1, 2, 3].map((page, turn): [number, number] => [page, 20 + turn * 3]);
  const errors = await inTurn(turns, ([page, opNumber]) => Promise.all(data.map((fits, n) => commitTo(target, [page, opNumber + n, [put("a", fits)]]))));
  const each = [
    [undefined, "InvalidParams", "InvalidParams"],
    ["InvalidParams", undefined, "InvalidParams"],
    ["InvalidParams", "InvalidParams", undefined],
  ];

  expect(errors).toStrictEqual([...each, ...each]);
  expect(compiled).toStrictEqual([TITLED, NUMBERED, DONE]);
});

/** The collection with this number, of a type that declares one more than a Store keeps compiled. */
const numbered = (n: number): string => `c${n}`;

const SCHEMAS = Array.from({ length: KEPT + 1 }, (_, n) => ({ title: numbered(n) }));

const inCollection = (n: number): Record<string, unknown> => ({ ...put("a"), collection: numbered(n) });

test("the Store keeps the 1024 compiled schemas it used last, and compiles another again when a commit needs it", async () => {
  const collections = Object.fromEntries(SCHEMAS.map((schema, n) => [numbered(n), { schema }]));
  const requests: [string, unknown][] = [["types_publish", { ...declaring("deck", 10), collections }], typedPage(1, { typeId: "deck", typeVersion: 1 })];
  const { target, compiled } = await after(requests, { compile: () => ({ check: () => [] }) });
  const commits: number[][] = [SCHEMAS.slice(0, KEPT).map((_, n) => n), [0], [KEPT], [0], [1], [KEPT], [2]];
  const compiledBy = await inTurn(Object.entries(commits), async ([turn, named]) => {
    const error = await commitTo(target, [1, 20 + Number(turn), named.map(inCollection)]);
    return [error, compiled.splice(0)];
  });

  expect(compiledBy).toStrictEqual([
    [undefined, SCHEMAS.slice(0, KEPT)],
    [undefined, []],
    [undefined, [SCHEMAS[KEPT]]],
    [undefined, []],
    [undefined, [SCHEMAS[1]]],
    [undefined, []],
    [undefined, [SCHEMAS[2]]],
  ]);
});
