import { type Document, type Op, type TreeNode, TreeNodeSchema, validate } from "@agentpages/protocol";
import { IDS } from "./runs.js";

/** The parent of every document of a tree, by id. Null for a root. */
export type Parents = ReadonlyMap<unknown, string | null>;

/** Whether the tree rules hold of an op: it is on a document of a tree, in the page scope. */
export type Ruled = (op: Op) => boolean;

/** The parent that the data of a tree document names. */
const parentIn = (data: unknown): string | null => {
  const node: { value?: TreeNode; issues?: unknown } = TreeNodeSchema["~standard"].validate(data);
  return Object.assign({}, node.value).parent;
};

export const parentsOf = (documents: readonly Document[]): Parents =>
  new Map(documents.map((document) => [document.id, parentIn(document.data)]));

/** The position of the first put into a tree of what is no tree node, or -1. */
export const malformedAt = (ops: readonly Op[], ruled: Ruled): number =>
  ops.findIndex((op) => ruled(op) && op.op === "put" && !validate(TreeNodeSchema, op.data).ok);

interface Below {
  id: string;
  /** The documents the commit has an op on. Each is where its op says, and no descendant. */
  touched: ReadonlySet<string>;
}

/** Everything under a document: a parent before its children, siblings by id. */
export const descendants = (parents: Parents, { id, touched }: Below): string[] =>
  IDS.flatMap((child) =>
    parents.get(child) === id && !touched.has(child) ? [child, ...descendants(parents, { id: child, touched })] : [],
  );

interface Commit {
  ops: readonly Op[];
  ruled: Ruled;
}

/** For each op, the descendants its delete deletes with it. */
export const sweptBy = (parents: Parents, { ops, ruled }: Commit): string[][] => {
  const touched = new Set(ops.filter(ruled).map((op) => op.id));
  return ops.map((op) => (ruled(op) && op.op === "delete" ? descendants(parents, { id: op.id, touched }) : []));
};

/** The tree after all the ops of a commit. */
const afterOf = (parents: Parents, commit: Commit): Parents => {
  const after = new Map(parents);
  const ops = commit.ops.filter(commit.ruled);
  ops.forEach((op) => {
    if (op.op === "put") after.set(op.id, parentIn(op.data));
    else after.delete(op.id);
  });
  sweptBy(parents, commit)
    .flat()
    .forEach((id) => {
      after.delete(id);
    });
  return after;
};

/** Where as many steps up as the tree has documents lead from a document, stopping at a root and at the document. */
const climbed = (after: Parents, id: string): string | null | undefined =>
  IDS.reduce((at) => (at === id ? at : after.get(at)), after.get(id));

const isBroken = (after: Parents, id: string): boolean => {
  const parent = after.get(id);
  return typeof parent === "string" && (!after.has(parent) || climbed(after, id) === id);
};

/** The position of the first put that leaves its document with a missing parent or in a cycle, or -1. */
export const brokenAt = (parents: Parents, commit: Commit): number => {
  const after = afterOf(parents, commit);
  return commit.ops.findIndex((op) => commit.ruled(op) && isBroken(after, op.id));
};
