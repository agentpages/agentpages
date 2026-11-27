import { type Answer, TOOL_SCHEMAS } from "@agentpages/protocol";
import { expect, test } from "vitest";
import * as fc from "fast-check";
import { ADVERTISED, call, callEach, committed, errorOf, failureOf, node, PUBLISHED, PAGE, put, remove, resultOf, saved, transactingAs, TREE_PAGE, world, type World } from "./support/store.ts";

/** What a commit of alice's changes: the id of each change, in order. */
const changedBy = async (target: World, request: [string, unknown]): Promise<string[]> =>
  resultOf(TOOL_SCHEMAS.state_commit.result, await call(target, request)).commit.changes.map((change) => change.id);

interface Task {
  id: string;
  parent: unknown;
}

/** The tasks of `PAGE`, each with the parent its data names, in the order of their ids. */
const tasksIn = async (target: World): Promise<Task[]> =>
  resultOf(TOOL_SCHEMAS.state_list.result, await call(target, ["state_list", { pageId: PAGE, scope: "page", collection: "tasks" }])).documents.map(
    ({ id, data }) => ({ id, parent: data.parent }),
  );

const idsIn = async (target: World): Promise<string[]> => (await tasksIn(target)).map((task) => task.id);

interface TreeLimits {
  maxOpsPerCommit: number;
  maxTreeDepth: number;
}

/** A Store with these limits, with `PAGE` as a page whose tasks are a tree. */
const withTree = async (limits: TreeLimits): Promise<World> => {
  const target = world({ config: { capability: { ...ADVERTISED, state: { maxDocumentBytes: 1024, liveChanges: true, ...limits } } } });
  await callEach(target, TREE_PAGE);
  return target;
};

const numbered = (n: number): string => `child-${String(n).padStart(3, "0")}`;

test("[TREE-5] a document with more than a hundred children is deleted with all of them, in the order of their ids", async () => {
  const target = await withTree({ maxOpsPerCommit: 200, maxTreeDepth: 4 });
  const children = Array.from({ length: 101 }, (_, n) => numbered(n));
  const lastFirst = children.map((_, n) => node(numbered(100 - n), "root"));
  await call(target, committed(2, [...lastFirst, node("root", null), node("other", null)]));
  const changed = await changedBy(target, committed(3, [remove("root")]));

  expect(changed).toStrictEqual(["root", ...children]);
  expect(await idsIn(target)).toStrictEqual(["other"]);
});

const blamed = (answer: Answer): unknown[] => [errorOf(answer), failureOf(answer)?.message, failureOf(answer)?.opIndex];

test("[ERR-3] the message of a commit that a tree does not allow names the op and what is wrong with it, and the commit saves nothing", async () => {
  const target = await withTree({ maxOpsPerCommit: 3, maxTreeDepth: 2 });
  await call(target, committed(2, [node("a", null), node("b", "a"), node("c", "b")]));
  const before = await saved(target.storage);
  const answers = [
    await call(target, committed(3, [node("d", null), put("e", { parent: null, index: "a0" })])),
    await call(target, committed(4, [put("e", { parent: "not an id", index: "a" })])),
    await call(target, committed(5, [node("d", null), node("e", "none")])),
    await call(target, committed(6, [node("a", "b")])),
    await call(target, committed(7, [remove("a"), node("d", null)])),
    await call(target, committed(8, [node("d", null), node("e", "c")])),
  ];

  expect(answers.map(blamed)).toStrictEqual([
    ["InvalidParams", "op 1: data.index: Expected /^[0-9A-Za-z]*[1-9A-Za-z]$/u", 1],
    ["InvalidParams", "op 0: data.parent: Expected /^[A-Za-z0-9_-]{1,128}$/u", 0],
    ["Conflict", "op 1: its parent none does not exist", 1],
    ["Conflict", "op 0: it would be its own ancestor", 0],
    ["LimitExceeded", "The changes, descendants included, are more than maxOpsPerCommit 3", undefined],
    ["LimitExceeded", "op 1: it would have more than maxTreeDepth 2 ancestors", 1],
  ]);
  expect(await saved(target.storage)).toStrictEqual(before);
});

test("[TREE-4] a root is under no document, not even under one whose id reads as null", async () => {
  const target = await withTree({ maxOpsPerCommit: 10, maxTreeDepth: 4 });
  await call(target, committed(2, [node("top", null), node("start", null), node("null", "start")]));
  const moved = await changedBy(target, committed(3, [node("start", "top")]));
  const deleted = await changedBy(target, committed(4, [remove("null")]));

  expect([moved, deleted]).toStrictEqual([["start"], ["null"]]);
  expect(await idsIn(target)).toStrictEqual(["start", "top"]);
  expect(await changedBy(target, committed(5, [remove("top")]))).toStrictEqual(["top", "start"]);
});

test("a commit to a tree writes and deletes no key outside its page", async () => {
  const touched: string[] = [];
  const recorded = transactingAs(world().storage, (tx) => ({
    put: (key, value) => {
      touched.push(key);
      tx.put(key, value);
    },
    delete: (key) => {
      touched.push(key);
      tx.delete(key);
    },
  }));
  const target = world({ ports: { storage: recorded } });
  await callEach(target, TREE_PAGE);
  touched.length = 0;
  await callEach(target, [committed(2, [node("a", null), node("b", "a")]), committed(3, [node("b", null), node("a", "b")]), committed(4, [remove("b")])]);

  expect(touched.filter((key) => !key.startsWith(`page/${PAGE}/`))).toStrictEqual([]);
  expect(await idsIn(target)).toStrictEqual([]);
});

const READS = new Set(["get", "getMany", "scan"]);

/** The error of a request of alice's, and how often the Store read its storage to answer it. */
const costOf = async (target: World, request: [string, unknown]): Promise<[string | undefined, number]> => {
  const reads = { made: 0 };
  target.plan((point) => {
    reads.made += Number(READS.has(point));
  });
  return [errorOf(await call(target, request)), reads.made];
};

/** Commits of alice's from `first` on, each of as many of the ops as a commit of five takes. */
const grown = (first: number, ops: unknown[]): [string, unknown][] =>
  Array.from({ length: Math.ceil(ops.length / 5) }, (_, n) => committed(first + n, ops.slice(n * 5, (n + 1) * 5)));

/** Puts of so many tasks under a parent, named after it. */
const under = (parent: string, count: number): unknown[] => Array.from({ length: count }, (_, n) => node(`${parent}-${n}`, parent));

/** A task with three children, and after them a child with so many children of its own, each with as many again. */
const bush = (root: string, size: number): unknown[] => {
  const last = `${root}-z`;
  return [node(root, null), ...under(root, 3), node(last, root), ...under(last, size), ...Array.from({ length: size }, (_, n) => under(`${last}-${n}`, size)).flat()];
};

test("[TREE-8] a delete that is beyond the limit reads no more of a subtree that is larger, in its width or below", async () => {
  const target = await withTree({ maxOpsPerCommit: 5, maxTreeDepth: 4 });
  await callEach(target, grown(100, [...bush("small", 1), ...bush("large", 5), node("few", null), ...under("few", 6), node("many", null), ...under("many", 60)]));
  const [small, large] = [await costOf(target, committed(2, [remove("small")])), await costOf(target, committed(3, [remove("large")]))];
  const [few, many] = [await costOf(target, committed(4, [remove("few")])), await costOf(target, committed(5, [remove("many")]))];

  expect([small, few]).toStrictEqual([large, many]);
  expect([large[0], many[0]]).toStrictEqual(["LimitExceeded", "LimitExceeded"]);
  expect(await changedBy(target, committed(6, [remove("large-z-4-4"), remove("many-59")]))).toStrictEqual(["large-z-4-4", "many-59"]);
});

/** Puts of a chain of tasks under a parent, each under the one before it. */
const chain = (name: string, { length, parent }: { length: number; parent: string | null }): unknown[] =>
  Array.from({ length }, (_, n) => node(`${name}-${n}`, n === 0 ? parent : `${name}-${n - 1}`));

/** A Store whose tree may be four deep, with a chain of five tasks, and one of twenty that was made by moving chains. */
const withChains = async (): Promise<World> => {
  const target = await withTree({ maxOpsPerCommit: 5, maxTreeDepth: 4 });
  const pieces = ["short", "p", "q", "r", "s"].map((name) => chain(name, { length: 5, parent: null }));
  const joins = [node("q-0", "p-4"), node("r-0", "q-4"), node("s-0", "r-4")];
  await callEach(target, grown(100, [...pieces.flat(), ...joins]));
  return target;
};

test("[TREE-9] a put that places a document climbs no further where the tree is deeper, and one that keeps its parent does not climb", async () => {
  const target = await withChains();
  const [shallow, deep] = [await costOf(target, committed(2, [node("x", "short-4")])), await costOf(target, committed(3, [node("x", "s-4")]))];
  const [root, kept] = [await costOf(target, committed(4, [put("short-0", { parent: null, index: "b" })])), await costOf(target, committed(5, [put("s-4", { parent: "s-3", index: "b" })]))];

  expect(shallow).toStrictEqual(deep);
  expect(deep[0]).toBe("LimitExceeded");
  expect(kept).toStrictEqual(root);
  expect(kept[0]).toBeUndefined();
});

test("[TREE-9] the puts of a commit climb together: as many reads for five documents as for one", async () => {
  const target = await withChains();
  const one = await costOf(target, committed(2, [node("x", "short-3")]));
  const five = await costOf(target, committed(3, [...under("short-2", 2), ...under("short-1", 2), node("y", "short-2-0")]));

  expect(five).toStrictEqual(one);
  expect(five[0]).toBeUndefined();
});

test("a commit outside a tree reads the storage as often as on a page without trees, whatever its ops are", async () => {
  const [typed, plain] = [await withTree({ maxOpsPerCommit: 5, maxTreeDepth: 4 }), world()];
  const label = { ...put("a"), collection: "labels" };
  await callEach(typed, [committed(2, [node("a", null), node("b", "a")]), committed(3, [label])]);
  await callEach(plain, [PUBLISHED, committed(3, [label])]);
  const outside = [await costOf(typed, committed(4, [{ ...label, data: { n: 1 } }])), await costOf(typed, committed(5, [{ ...remove("a"), collection: "labels" }]))];
  const untyped = [await costOf(plain, committed(4, [{ ...label, data: { n: 1 } }])), await costOf(plain, committed(5, [{ ...remove("a"), collection: "labels" }]))];

  expect(outside[1]).toStrictEqual(outside[0]);
  expect(untyped[1]).toStrictEqual(untyped[0]);
  expect(await idsIn(typed)).toStrictEqual(["a", "b"]);
});

const IDS = ["a", "b", "c", "d", "e"];

const anOp = fc.oneof(
  fc.record({ id: fc.constantFrom(...IDS), parent: fc.constantFrom(null, ...IDS) }).map(({ id, parent }) => node(id, parent)),
  fc.constantFrom(...IDS).map((id) => remove(id)),
);

/** A few ops, each on a document of its own. */
const someOps = fc.uniqueArray(anOp, { minLength: 1, maxLength: 3, selector: (op) => op.id });

/** The tasks a walk down from a parent reaches: each followed by what is under it. */
const reached = (tasks: Task[], parent: string | null): string[] =>
  tasks.flatMap((task) => (task.parent === parent ? [task.id].concat(reached(tasks, task.id)) : []));

test("[TREE-4] whatever is committed, every tree document hangs under a root, and deleting the roots deletes each with what is under it", async () => {
  await fc.assert(
    fc.asyncProperty(fc.array(someOps, { minLength: 1, maxLength: 12 }), async (commits) => {
      const target = await withTree({ maxOpsPerCommit: 10, maxTreeDepth: 4 });
      await callEach(target, commits.map((ops, n) => committed(n + 2, ops)));
      const tasks = await tasksIn(target);
      const roots = tasks.filter((task) => task.parent === null).map((task) => remove(task.id));

      expect(new Set(reached(tasks, null))).toStrictEqual(new Set(tasks.map((task) => task.id)));
      expect(await changedBy(target, committed(99, roots))).toStrictEqual(reached(tasks, null));
      expect(await idsIn(target)).toStrictEqual([]);
    }),
    { numRuns: 60, seed: 2026 },
  );
});
