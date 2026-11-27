import type { JsonObject, Op, Scope } from "@agentpages/protocol";
import { pick, rng } from "./kit.js";

/** Pinned, so that the runs are the same every time. */
const SEED = 20_261_127;
export const RUNS = 20;
export const STEPS = 40;
const POOL = 20;

/** The collection that is a tree in the page scope. */
export const TREE = "tasks";
export const COLLECTIONS: string[] = [TREE, "notes"];
export const IDS: string[] = ["a", "b", "c", "d"];

export type Caller = "agent" | "bob" | "carol";
export type LogName = "page" | "bob" | "carol";

/** Who sends a request, in which scope, and the log the two make it reach. */
export interface Seat {
  caller: Caller;
  scope: Scope;
  log: LogName;
}

export const OWNER: Seat = { caller: "agent", scope: "page", log: "page" };
export const BOBS_OWN: Seat = { caller: "bob", scope: "viewer", log: "bob" };
export const CAROLS_OWN: Seat = { caller: "carol", scope: "viewer", log: "carol" };
const SEATS: Seat[] = [OWNER, { caller: "bob", scope: "page", log: "page" }, { caller: "carol", scope: "page", log: "page" }, BOBS_OWN, CAROLS_OWN];

/** A commit as it is sent, any number of times: its `opId` is one of a few, so that some are used twice. */
export interface Request {
  seat: Seat;
  opId: number;
  ops: Op[];
}

interface Named {
  seat: Seat;
  collection: string;
}

export type Step =
  | { kind: "commit"; request: Request }
  | ({ kind: "get"; id: string } & Named)
  | ({ kind: "list"; limit: number } & Named)
  | { kind: "commits"; seat: Seat; since: number; limit: number };

type Next = () => number;

const LIMITS = [1, 2, 2, 100];
const SINCES = [0, 1, 2, 3, 5, 99];
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const OP_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const OP_COUNTS = [1, 2, 2, 3];

/** No condition, that the document does not exist, or a revision that is sometimes its counter and sometimes not. */
const CONDITIONS: { ifRevision?: number }[] = [{}, {}, {}, {}, {}, { ifRevision: 0 }, { ifRevision: 0 }, { ifRevision: 1 }, { ifRevision: 2 }];


/** The last index is none. */
const INDEXES = ["1", "1", "1", "a", "a", "a", "b5", "0"];

const OP_KINDS: Op["op"][] = ["put", "put", "put", "delete"];
const STEP_KINDS: Step["kind"][] = ["commit", "commit", "commit", "commit", "commit", "get", "list", "list", "commits"];

export const keyOf = ({ collection, id }: { collection: string; id: string }): string => `${collection}/${id}`;

/** A root, or under another document, which is sometimes there and sometimes not. */
const parentBy = (next: Next, id: string): string | null => pick(next, [null, null, ...IDS.filter((other) => other !== id)]);

/** The data of a document: its place in the tree, or a number. */
const dataBy = (next: Next, { collection, id }: { collection: string; id: string }): JsonObject =>
  collection === TREE ? { parent: parentBy(next, id), index: pick(next, INDEXES) } : { n: pick(next, DIGITS) };

const opBy = (next: Next): Op => {
  const named = { collection: pick(next, [TREE, ...COLLECTIONS]), id: pick(next, IDS) };
  const [data, op] = [dataBy(next, named), pick(next, OP_KINDS)];
  const change: Op = op === "put" ? { op, ...named, data } : { op, ...named };
  return { ...change, ...pick(next, CONDITIONS) };
};

/** Up to three ops, on different documents. */
const opsBy = (next: Next): Op[] => {
  const drawn = [opBy(next), opBy(next), opBy(next)];
  const different = drawn.filter((op, index) => drawn.findIndex((first) => keyOf(first) === keyOf(op)) === index);
  return different.slice(0, pick(next, OP_COUNTS));
};

/**
 * A delete of a document of the tree, alone or with a put of another, which is sometimes under what the delete takes
 * along, and a put of a note, which sometimes has the id of a document the delete takes along.
 */
const fellingBy = (next: Next): Op[] => {
  const felled = pick(next, IDS);
  const id = pick(next, IDS.filter((other) => other !== felled));
  const fell: Op = { op: "delete", collection: TREE, id: felled };
  const graft: Op = { op: "put", collection: TREE, id, data: { parent: parentBy(next, id), index: "1" } };
  const note: Op = { op: "put", collection: "notes", id: pick(next, IDS), data: {} };
  return pick(next, [[fell], [fell, graft, note], [note, graft, fell]]);
};

const OPS = [opsBy, opsBy, opsBy, fellingBy];

const requestBy = (next: Next): Request => ({ seat: pick(next, SEATS), opId: pick(next, OP_IDS), ops: pick(next, OPS)(next) });

const stepBy = (next: Next, requests: Request[]): Step => {
  const kind = pick(next, STEP_KINDS);
  const [seat, collection] = [pick(next, SEATS), pick(next, COLLECTIONS)];
  if (kind === "commit") return { kind, request: pick(next, requests) };
  if (kind === "get") return { kind, seat, collection, id: pick(next, IDS) };
  if (kind === "list") return { kind, seat, collection, limit: pick(next, LIMITS) };
  return { kind, seat, since: pick(next, SINCES), limit: pick(next, LIMITS) };
};

/** An `opId` no request of the pool has. */
const PLANTING = 12;

/** A commit of the owner that puts every document of the tree: each a root, or under one that an earlier op put. */
const planted = (next: Next): Step => {
  const ops = IDS.map((id, index): Op => ({ op: "put", collection: TREE, id, data: { parent: pick(next, [null, ...IDS.slice(0, index)]), index: pick(next, INDEXES.slice(0, -1)) } }));
  return { kind: "commit", request: { seat: OWNER, opId: PLANTING, ops } };
};

/**
 * The steps of run `n`: first a tree, then commits out of a pool of a few requests, so that some are sent twice, and
 * reads between them.
 */
const stepsOf = (n: number): Step[] => {
  const next = rng(SEED + n);
  const requests = Array.from({ length: POOL }, () => requestBy(next));
  return [planted(next), ...Array.from({ length: STEPS - 1 }, () => stepBy(next, requests))];
};

/** Every run with the number of its page: the same runs every time. */
export const everyRun = (): [number, Step[]][] => Array.from({ length: RUNS }, (_, index): [number, Step[]] => [index + 1, stepsOf(index + 1)]);
