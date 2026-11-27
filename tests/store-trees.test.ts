import { type Answer, TOOL_SCHEMAS } from "@agentpages/protocol";
import type { Storage } from "@agentpages/storage";
import { expect, test } from "vitest";
import * as fc from "fast-check";
import { ADVERTISED, call, callEach, committed, declaring, errorOf, failureOf, node, PAGE, PUBLISHED, publishing, put, remove, resultOf, saved, transactingAs, TREE_PAGE, world, type World } from "./support/store.ts";

const SCOPE = `page/${PAGE}/s/p/`;

/** What a commit of alice's changes: the id of each change, in order. */
const changedBy = async (target: World, request: [string, unknown]): Promise<string[]> =>
  resultOf(TOOL_SCHEMAS.state_commit.result, await call(target, request)).commit.changes.map((change) => change.id);

const idsIn = async (target: World, collection: string): Promise<string[]> =>
  resultOf(TOOL_SCHEMAS.state_list.result, await call(target, ["state_list", { pageId: PAGE, scope: "page", collection }])).documents.map((document) => document.id);

/** A Store that takes so many ops in a commit, with `PAGE` as a page whose tasks are a tree. */
const withTree = async (maxOpsPerCommit: number): Promise<World> => {
  const target = world({ config: { capability: { ...ADVERTISED, state: { maxDocumentBytes: 1024, maxOpsPerCommit, liveChanges: true } } } });
  await callEach(target, TREE_PAGE);
  return target;
};

const keysOf = async (storage: Storage): Promise<string[]> => (await storage.scan({ prefix: "", limit: Number.MAX_SAFE_INTEGER })).map(([key]) => key);

/** The rows that say which tree document is under which, as the storage holds them. */
const rowsIn = async (storage: Storage): Promise<string[]> => (await keysOf(storage)).filter((key) => key.startsWith(`${SCOPE}t/`));

const numbered = (n: number): string => `child-${String(n).padStart(3, "0")}`;

test("[TREE-5] a document with more children than one scan returns is deleted with all of them, in the order of their ids", async () => {
  const target = await withTree(200);
  const children = Array.from({ length: 101 }, (_, n) => numbered(n));
  const lastFirst = children.map((_, n) => node(numbered(100 - n), "root"));
  await call(target, committed(2, [...lastFirst, node("root", null), node("other", null)]));
  const before = await rowsIn(target.storage);
  const changed = await changedBy(target, committed(3, [remove("root")]));

  expect(before).toStrictEqual(children.map((id) => `${SCOPE}t/tasks/root/${id}`));
  expect(changed).toStrictEqual(["root", ...children]);
  expect(await idsIn(target, "tasks")).toStrictEqual(["other"]);
  expect(await rowsIn(target.storage)).toStrictEqual([]);
});

const blamed = (answer: Answer): unknown[] => [errorOf(answer), failureOf(answer)?.message, failureOf(answer)?.opIndex];

test("[ERR-3] the message of a commit that a tree does not allow names the op and what is wrong with it, and the commit saves nothing", async () => {
  const target = await withTree(3);
  await call(target, committed(2, [node("a", null), node("b", "a"), node("c", "b")]));
  const before = await saved(target.storage);
  const answers = [
    await call(target, committed(3, [node("d", null), put("e", { parent: null, index: "a0" })])),
    await call(target, committed(4, [put("e", { parent: "not an id", index: "a" })])),
    await call(target, committed(5, [node("d", null), node("e", "none")])),
    await call(target, committed(6, [node("a", "c")])),
    await call(target, committed(7, [remove("a"), node("d", null)])),
  ];

  expect(answers.map(blamed)).toStrictEqual([
    ["InvalidParams", "op 1: data.index: Expected /^[0-9A-Za-z]*[1-9A-Za-z]$/u", 1],
    ["InvalidParams", "op 0: data.parent: Expected /^[A-Za-z0-9_-]{1,128}$/u", 0],
    ["Conflict", "op 1: its parent none does not exist", 1],
    ["Conflict", "op 0: it would be its own ancestor", 0],
    ["LimitExceeded", "4 changes are more than maxOpsPerCommit 3", undefined],
  ]);
  expect(await saved(target.storage)).toStrictEqual(before);
});

test("[TREE-4] a root is under no document, not even under one whose id reads as null", async () => {
  const target = await withTree(10);
  await call(target, committed(2, [node("top", null), node("start", null), node("null", "start")]));
  const moved = await changedBy(target, committed(3, [node("start", "top")]));
  const deleted = await changedBy(target, committed(4, [remove("null")]));

  expect([moved, deleted]).toStrictEqual([["start"], ["null"]]);
  expect(await idsIn(target, "tasks")).toStrictEqual(["start", "top"]);
  expect(await rowsIn(target.storage)).toStrictEqual([`${SCOPE}t/tasks/top/start`]);
});

/** The row that says a task is under a parent. */
const row = (parent: string, id: string): string => `${SCOPE}t/tasks/${parent}/${id}`;

type Write = [string, string];

/** `storage`, with every write of its transactions recorded in `writes`, in order. */
const recording = (storage: Storage, writes: Write[]): Storage =>
  transactingAs(storage, (tx) => ({
    put: (key, value) => {
      writes.push(["put", key]);
      tx.put(key, value);
    },
    delete: (key) => {
      writes.push(["delete", key]);
      tx.delete(key);
    },
  }));

/** The documents, counters and logs of the page scope, and what the page remembers of its requests. */
const ORDINARY = /\/s\/p\/(?:[drl]\/|head$)|\/op\//u;

/** What a commit of alice's writes besides its documents, counters, log and record. */
const rowWrites = async (target: World, { writes, request }: { writes: Write[]; request: [string, unknown] }): Promise<Write[]> => {
  writes.length = 0;
  await call(target, request);
  return writes.filter(([, key]) => !ORDINARY.test(key));
};

test("a commit writes the row of each tree document it moves, deletes the row it had, and writes nothing else", async () => {
  const writes: Write[] = [];
  const kept = world();
  const target = world({ ports: { storage: recording(kept.storage, writes) } });
  await callEach(target, TREE_PAGE);
  const written = [
    await rowWrites(target, { writes, request: committed(2, [node("r", null), node("a", "r"), node("b", "a"), remove("none")]) }),
    await rowWrites(target, { writes, request: committed(3, [node("b", "r"), put("a", { parent: "r", index: "b" })]) }),
    await rowWrites(target, { writes, request: committed(4, [node("r", null), { ...put("x", { parent: "r", index: "a" }), collection: "labels" }]) }),
    await rowWrites(target, { writes, request: committed(5, [remove("r"), { ...remove("x"), collection: "labels" }]) }),
  ];

  expect(written).toStrictEqual([
    [
      ["put", row("r", "a")],
      ["put", row("a", "b")],
    ],
    [
      ["delete", row("a", "b")],
      ["put", row("r", "b")],
      ["delete", row("r", "a")],
      ["put", row("r", "a")],
    ],
    [],
    [
      ["delete", row("r", "a")],
      ["delete", row("r", "b")],
    ],
  ]);
  expect(await rowsIn(kept.storage)).toStrictEqual([]);
});

/** How often a commit of alice's scans the storage. */
const scansOf = async (target: World, request: [string, unknown]): Promise<number> => {
  const scans = { made: 0 };
  target.plan((point) => {
    scans.made += Number(point === "scan");
  });
  await call(target, request);
  return scans.made;
};

test("a delete scans for the children of its document, and of each descendant, in a tree and nowhere else", async () => {
  const [typed, plain] = [await withTree(10), world()];
  await call(typed, committed(2, [node("a", null), node("b", "a"), node("c", "a"), { ...put("a"), collection: "labels" }]));
  await callEach(plain, [PUBLISHED, committed(2, [node("a", null), node("b", "a")])]);
  const scans = [
    await scansOf(typed, committed(3, [{ ...remove("a"), collection: "labels" }, node("d", "a")])),
    await scansOf(typed, committed(4, [remove("a"), remove("none")])),
    await scansOf(plain, committed(3, [remove("a")])),
  ];

  expect(scans).toStrictEqual([0, 5, 0]);
  expect(await idsIn(plain, "tasks")).toStrictEqual(["b"]);
});

test("[TREE-5] a collection that its type declared a tree is one while the type version of the page leaves it out", async () => {
  const target = await withTree(10);
  await call(target, committed(2, [node("a", null), node("b", "a")]));
  await callEach(target, [
    ["types_publish", { ...declaring("deck", 3), baseVersion: 1, collections: { labels: { schema: {} } } }],
    ["pages_publish", { ...publishing({ page: 1, baseVersion: 1, op: 4 }), content: { kind: "type", typeId: "deck", typeVersion: 2 } }],
  ]);
  const refused = errorOf(await call(target, committed(5, [node("c", "a")])));
  const changed = await changedBy(target, committed(6, [remove("a")]));

  expect([refused, changed]).toStrictEqual(["InvalidParams", ["a", "b"]]);
  expect(await rowsIn(target.storage)).toStrictEqual([]);
});

const IDS = ["a", "b", "c", "d", "e"];

const anOp = fc.oneof(
  fc.record({ id: fc.constantFrom(...IDS), parent: fc.constantFrom(null, ...IDS) }).map(({ id, parent }) => node(id, parent)),
  fc.constantFrom(...IDS).map((id) => remove(id)),
);

/** A few ops, each on a document of its own. */
const someOps = fc.uniqueArray(anOp, { minLength: 1, maxLength: 3, selector: (op) => op.id });

/** A task as the storage holds it. */
const StoredSchema = TOOL_SCHEMAS.state_get.result;

interface Stored {
  id: string;
  parent: unknown;
}

/** The tasks the storage holds, each with the parent its data names. */
const tasksIn = async (storage: Storage): Promise<Stored[]> =>
  (await storage.scan({ prefix: `${SCOPE}d/tasks/`, limit: Number.MAX_SAFE_INTEGER }))
    .map(([, document]) => resultOf(StoredSchema, { kind: "result", result: { document } }).document)
    .flatMap((task) => (task === null ? [] : [{ id: task.id, parent: task.data.parent }]));

/** The tasks a walk down from the roots reaches. */
const reached = (tasks: Stored[], parent: string | null): string[] =>
  tasks.flatMap((task) => (task.parent === parent ? [task.id].concat(reached(tasks, task.id)) : []));

/** The row a task must have: none for a root. */
const rowOf = ({ id, parent }: Stored): string[] => (typeof parent === "string" ? [row(parent, id)] : []);

test("[TREE-4] whatever is committed, every tree document hangs under a root and has the row of its parent, and no other row exists", async () => {
  await fc.assert(
    fc.asyncProperty(fc.array(someOps, { minLength: 1, maxLength: 12 }), async (commits) => {
      const target = await withTree(10);
      await callEach(target, commits.map((ops, n) => committed(n + 2, ops)));
      const tasks = await tasksIn(target.storage);

      expect(new Set(reached(tasks, null))).toStrictEqual(new Set(tasks.map((task) => task.id)));
      expect(new Set(await rowsIn(target.storage))).toStrictEqual(new Set(tasks.flatMap(rowOf)));
    }),
    { numRuns: 60, seed: 2026 },
  );
});
