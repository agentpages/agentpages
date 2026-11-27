import type { Op, Scope } from "@agentpages/protocol";
import { pick, rng } from "./kit.js";

/** Pinned, so that the runs are the same every time. */
const SEED = 20_261_127;
export const RUNS = 20;
export const STEPS = 40;
const POOL = 20;

export const COLLECTIONS: string[] = ["tasks", "notes"];
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
const OP_COUNTS = [1, 2];

/** No condition, that the document does not exist, or a revision that is sometimes its counter and sometimes not. */
const CONDITIONS: { ifRevision?: number }[] = [{}, {}, {}, {}, {}, { ifRevision: 0 }, { ifRevision: 0 }, { ifRevision: 1 }, { ifRevision: 2 }];

const OP_KINDS: Op["op"][] = ["put", "put", "put", "delete"];
const STEP_KINDS: Step["kind"][] = ["commit", "commit", "commit", "commit", "commit", "get", "list", "list", "commits"];

export const keyOf = ({ collection, id }: { collection: string; id: string }): string => `${collection}/${id}`;

const opBy = (next: Next): Op => {
  const named = { collection: pick(next, COLLECTIONS), id: pick(next, IDS) };
  const [data, op] = [{ n: pick(next, DIGITS) }, pick(next, OP_KINDS)];
  const change: Op = op === "put" ? { op, ...named, data } : { op, ...named };
  return { ...change, ...pick(next, CONDITIONS) };
};

/** One op or two, on different documents. */
const opsBy = (next: Next): Op[] => {
  const [first, second] = [opBy(next), opBy(next)];
  const different = keyOf(first) === keyOf(second) ? [first] : [first, second];
  return different.slice(0, pick(next, OP_COUNTS));
};

const requestBy = (next: Next): Request => ({ seat: pick(next, SEATS), opId: pick(next, OP_IDS), ops: opsBy(next) });

const stepBy = (next: Next, requests: Request[]): Step => {
  const kind = pick(next, STEP_KINDS);
  const [seat, collection] = [pick(next, SEATS), pick(next, COLLECTIONS)];
  if (kind === "commit") return { kind, request: pick(next, requests) };
  if (kind === "get") return { kind, seat, collection, id: pick(next, IDS) };
  if (kind === "list") return { kind, seat, collection, limit: pick(next, LIMITS) };
  return { kind, seat, since: pick(next, SINCES), limit: pick(next, LIMITS) };
};

/** The steps of run `n`: commits out of a pool of a few requests, so that some are sent twice, and reads between them. */
const stepsOf = (n: number): Step[] => {
  const next = rng(SEED + n);
  const requests = Array.from({ length: POOL }, () => requestBy(next));
  return Array.from({ length: STEPS }, () => stepBy(next, requests));
};

/** Every run with the number of its page: the same runs every time. */
export const everyRun = (): [number, Step[]][] => Array.from({ length: RUNS }, (_, index): [number, Step[]] => [index + 1, stepsOf(index + 1)]);
