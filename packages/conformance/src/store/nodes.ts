import type { Change, JsonObject, Op, PageContent } from "@agentpages/protocol";
import type { Driver } from "../contract.js";
import { collection, having, type Session, type, TYPE_PUBLISH, typed } from "./kit.js";
import { type Acting, COMMIT, committing, limitsOf, put, retyped, STATE_LIST, type Surface } from "./surface.js";

const tree = { ...collection({}), tree: true };

/** Publishes the first version of type `n`, whose `tasks` and `notes` are trees and whose `labels` are not. */
export const ofTrees = async (alice: Session, n: number): Promise<PageContent> => {
  await alice.ok(TYPE_PUBLISH, having(type(n, 0), ["collections", { tasks: tree, notes: tree, labels: collection({}) }]));
  return typed(n, 1);
};

/** The data of a tree document: its parent and its index, whatever they are. */
export const place = (parent: unknown, index: unknown = "a"): JsonObject => ({ parent, index });

/** A put of a task under a parent, or as a root. */
export const node = (id: string, parent: string | null): Op => put(id, place(parent));

/** `op`, a put, with other data. */
export const holding = (op: Op, data: JsonObject): unknown => having(op, ["data", data]);

/** An index that ends in zero, which none may. */
export const ZERO: string = String(0);

/** The ids of the documents a commit of these ops changes, in the order of its changes. */
export const changedBy = async (surface: Surface, ops: readonly unknown[]): Promise<string[]> =>
  (await surface.ok(COMMIT, committing(ops))).commit.changes.map((change) => change.id);

/** The ids of the documents a list returns. */
export const idsIn = async (surface: Surface, params: unknown): Promise<string[]> =>
  (await surface.ok(STATE_LIST, params)).documents.map((document) => document.id);

/** The change that deletes a task whose counter was 1. */
export const gone = (id: string): Change => ({ collection: "tasks", id, revision: 2, document: null });

/** Puts of a chain of tasks, each under the one before it: `name-0` is a root, and `name-n` has `n` ancestors. */
export const chain = (name: string, length: number): Op[] =>
  Array.from({ length }, (_, n) => node(`${name}-${n}`, n === 0 ? null : `${name}-${n - 1}`));

/** Puts of a task and of so many children of it. */
export const family = (parent: string, children: number): Op[] => [node(parent, null), ...Array.from({ length: children }, (_, n) => node(`${parent}-${n}`, parent))];

/** Commits ops in their order, as many at a time as the Store takes in a commit. */
export const grow = async ([acting, driver]: [Surface, Driver], ops: readonly Op[]): Promise<void> => {
  const { maxOpsPerCommit } = limitsOf(driver);
  if (ops.length === 0) return;
  await acting.ok(COMMIT, committing(ops.slice(0, maxOpsPerCommit)));
  await grow([acting, driver], ops.slice(maxOpsPerCommit));
};

/** Moves the page to a second version of its type, which leaves the trees out. */
export const withoutTrees = (driver: Driver, { page: n }: Acting): Promise<void> => retyped(driver, { page: n, collections: { labels: collection({}) } });

export const BEYOND = "LimitExceeded";

