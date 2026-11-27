import type { Key, Reader, Value } from "@agentpages/storage";
import { ok, type Outcome, type Refusal } from "../pipeline/index.js";
import { documentKey } from "../state/keys.js";
import { cascaded, type Cascading, type Felling, type Plan } from "./cascade.js";
import { type Grove, parentIn, parentOf } from "./place.js";

/** Where a tree document is after a commit. Nothing where it is not there. */
type Place = { parent: string | null } | undefined;

/** What is wrong with where a put leaves its document, and the error it is. */
interface Flaw {
  error: "LimitExceeded" | "Conflict";
  what: string;
}

interface Hold extends Grove {
  tx: Reader;
  maxTreeDepth: number;
  /** A storage run never reads its own writes, so where the commit leaves each document it changes is kept here. */
  changed: ReadonlyMap<Key, Place>;
  /** The flaw of each op that has one, by the position of the op. */
  flaws: Map<number, Flaw>;
}

/** The way up from a document that a put places, as far as it has come. */
interface Climb {
  opIndex: number;
  collection: string;
  start: string;
  /** The ancestor it has reached. */
  at: string;
  /** The ancestors it has passed. */
  seen: Set<string>;
}

const placesOf =
  ({ scope, trees }: Grove) =>
  ({ op, swept }: Felling): [Key, Place][] => {
    if (!trees.has(op.collection)) return [];
    const own: Place = op.op === "put" ? { parent: parentIn(op.data) } : undefined;
    return [[documentKey(scope, op), own], ...swept.map((gone): [Key, Place] => [documentKey(scope, gone), undefined])];
  };

const keyOf = ({ scope }: Hold, { collection, at }: Climb): Key => documentKey(scope, { collection, id: at });

/** Whether the commit deletes the document of a key. */
const deletes = ({ changed }: Hold, key: Key): boolean => changed.has(key) && changed.get(key) === undefined;

/** Where the document of a key is after the commit, when the storage holds it as `stored`. */
const placeOf = ({ changed }: Hold, [key, stored]: [Key, Value | undefined]): Place => {
  if (changed.has(key)) return changed.get(key);
  return stored && { parent: parentOf(stored) };
};

/**
 * Section 4.2 of the spec: whether a climb goes on from the ancestor it has reached. It ends without a flaw where it
 * has been before, and with one when the ancestors are more than `maxTreeDepth` or the document is its own.
 */
const goesOn =
  ({ maxTreeDepth, flaws }: Hold) =>
  ({ opIndex, start, at, seen }: Climb): boolean => {
    if (seen.has(at)) return false;
    seen.add(at);
    if (seen.size > maxTreeDepth) flaws.set(opIndex, { error: "LimitExceeded", what: `it would have more than maxTreeDepth ${maxTreeDepth} ancestors` });
    else if (at === start) flaws.set(opIndex, { error: "Conflict", what: "it would be its own ancestor" });
    return !flaws.has(opIndex);
  };

const missing = (parent: string): Flaw => ({ error: "Conflict", what: `its parent ${parent} does not exist` });

/** A climb one step further up. It ends at a root, and where a document is not there: that is a flaw of a parent only. */
const risen =
  (hold: Hold, stored: ReadonlyMap<Key, Value | undefined>) =>
  (climb: Climb): Climb[] => {
    const key = keyOf(hold, climb);
    const place = placeOf(hold, [key, stored.get(key)]);
    if (place === undefined && climb.seen.size === 1) hold.flaws.set(climb.opIndex, missing(climb.at));
    return place === undefined || place.parent === null ? [] : [{ ...climb, at: place.parent }];
  };

/** Every climb to its end, all of them one step at a time: one read of what they have reached for each step. */
const climbed = async (hold: Hold, climbs: Climb[]): Promise<void> => {
  const open = climbs.filter(goesOn(hold));
  if (open.length === 0) return;
  const keys = [...new Set(open.map((climb) => keyOf(hold, climb)))];
  const rows = await hold.tx.getMany(keys);
  const stored = new Map(keys.map((key, index) => [key, rows[index]]));
  await climbed(hold, open.flatMap(risen(hold, stored)));
};

/**
 * Section 4.2 of the spec: a put places its document when it creates it or changes its parent, and only then is the
 * way up from it climbed. A document that stays has its parent unless the commit deletes it.
 */
const begun =
  (hold: Hold) =>
  ({ op, stored }: Felling, opIndex: number): Climb[] => {
    if (op.op === "delete" || !hold.trees.has(op.collection)) return [];
    const parent = parentIn(op.data);
    if (parent === null) return [];
    const climb = { opIndex, collection: op.collection, start: op.id, at: parent, seen: new Set<string>() };
    if (stored === undefined || parentOf(stored) !== parent) return [climb];
    if (deletes(hold, keyOf(hold, climb))) hold.flaws.set(opIndex, missing(parent));
    return [];
  };

export interface Planned {
  grove: Grove;
  plan: Plan;
}

/** The first op, in the order of the ops, that an error of the tree rules blames. */
type Blame = (error: Flaw["error"]) => Refusal | undefined;

/** What a commit does to the trees of its scope, and what the tree rules find wrong with where its puts leave their documents. */
export interface Grown extends Planned {
  blame: Blame;
}

const blameOf = async (tx: Reader, { grove, plan, maxTreeDepth }: Planned & { maxTreeDepth: number }): Promise<Blame> => {
  const hold: Hold = { ...grove, tx, maxTreeDepth, changed: new Map(plan.pending.flatMap(placesOf(grove))), flaws: new Map() };
  await climbed(hold, plan.pending.flatMap(begun(hold)));
  return (error) =>
    plan.pending
      .flatMap((_, opIndex): Refusal[] => {
        const flaw = hold.flaws.get(opIndex);
        return flaw?.error === error ? [{ error, message: `op ${opIndex}: ${flaw.what}`, opIndex }] : [];
      })
      .at(0);
};

export interface Growing extends Cascading {
  maxTreeDepth: number;
}

/**
 * Section 4.2 of the spec: the trees of a scope after a commit. With more changes than `maxOpsPerCommit` the commit is
 * beyond the limit, which is decided before any other tree rule and before the tree is climbed.
 */
export const grown = async (tx: Reader, { maxTreeDepth, ...cascading }: Growing): Promise<Outcome<Grown>> => {
  const plan = await cascaded(tx, cascading);
  if (!plan.ok) return plan;
  const whole = { grove: cascading.grove, plan: plan.value };
  return ok({ ...whole, blame: await blameOf(tx, { ...whole, maxTreeDepth }) });
};
