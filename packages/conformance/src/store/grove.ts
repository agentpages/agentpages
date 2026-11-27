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

export interface Asked {
  ops: readonly Op[];
  ruled: Ruled;
}

/** The ops of a commit that the tree rules hold of. */
const ruledOf = ({ ops, ruled }: Asked): Op[] => ops.filter(ruled);

/** The tree as the ops of a commit leave it, with the documents that lost their parent still in it. */
const afterOps = (parents: Parents, asked: Asked): Parents => {
  const after = new Map(parents);
  ruledOf(asked).forEach((op) => {
    if (op.op === "put") after.set(op.id, parentIn(op.data));
    else after.delete(op.id);
  });
  return after;
};

/** The documents a commit has an op on. */
const touchedBy = (asked: Asked): ReadonlySet<unknown> => new Set(ruledOf(asked).map((op) => op.id));

/**
 * What is left of a tree once every document whose parent is not there is gone, and then those that lost theirs so, to
 * the end. A document the commit puts stays: its put is what is wrong.
 */
const standing = (after: Parents, put: ReadonlySet<unknown>): Parents => {
  const left = [...after].filter(([id, parent]) => parent === null || after.has(parent) || put.has(id));
  return left.length === after.size ? after : standing(new Map(left), put);
};

/** The way down to a document from the first document above it that is not there, as ids between slashes. */
const wayTo = (after: Parents, id: string): string => {
  const parent = String(after.get(id));
  return after.has(parent) ? `${wayTo(after, parent)}/${id}` : `${parent}/${id}`;
};

/**
 * For each op, the descendants its delete deletes with it: the documents whose way starts at the document of the op,
 * each after its parent and siblings by id, which is the order of their ways.
 */
export const sweptBy = (parents: Parents, asked: Asked): string[][] => {
  const after = afterOps(parents, asked);
  const ways = IDS.map((id) => wayTo(after, id));
  ways.sort();
  return asked.ops.map((op) => ways.filter((way) => asked.ruled(op) && way.startsWith(`${op.id}/`)).map((way) => way.slice(way.lastIndexOf("/") + 1)));
};

/** Where as many steps up as the tree has documents lead from a document, stopping at a root and at the document. */
const climbed = (left: Parents, id: string): string | null | undefined =>
  IDS.reduce((at) => (at === id ? at : left.get(at)), left.get(id));

/**
 * Section 4.2 of the spec: the position of the first put that leaves its document with a missing parent, or places it
 * as its own ancestor, or -1. A put places its document when it creates it or changes its parent.
 */
export const brokenAt = (parents: Parents, asked: Asked): number => {
  const left = standing(afterOps(parents, asked), touchedBy(asked));
  return asked.ops.findIndex((op) => {
    const parent = left.get(op.id);
    if (!asked.ruled(op) || typeof parent !== "string") return false;
    return !left.has(parent) || (parents.get(op.id) !== parent && climbed(left, op.id) === op.id);
  });
};
