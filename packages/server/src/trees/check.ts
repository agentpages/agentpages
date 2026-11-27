import type { Key, Reader } from "@agentpages/storage";
import { ok, type Outcome, refuse } from "../pipeline/index.js";
import { type DocumentId, documentKey } from "../state/keys.js";
import type { Before } from "../state/records.js";
import { cascaded, type Felling, type Plan } from "./cascade.js";
import { type Grove, inTurn, parentIn, parentOf } from "./place.js";

/** Where a tree document is after a commit. Null where there is none. */
type Place = { parent: string | null } | null;

/** The place of any document of a scope after a commit. */
type After = (named: DocumentId) => Promise<Place>;

const placesOf =
  ({ scope, trees }: Grove) =>
  ({ op, swept }: Felling): [Key, Place][] => {
    if (!trees.has(op.collection)) return [];
    const own: Place = op.op === "put" ? { parent: parentIn(op.data) } : null;
    return [[documentKey(scope, op), own], ...swept.map((gone): [Key, Place] => [documentKey(scope, gone), null])];
  };

/** A storage run never reads its own writes, so what the commit changes is kept here and the rest is read. */
const afterOf = (tx: Reader, { grove, plan }: Planned): After => {
  const changed = new Map(plan.pending.flatMap(placesOf(grove)));
  return async (named) => {
    const key = documentKey(grove.scope, named);
    const known = changed.get(key);
    if (known !== undefined) return known;
    const stored = await tx.get(key);
    return stored === undefined ? null : { parent: parentOf(stored) };
  };
};

interface Climb {
  collection: string;
  start: string;
  at: string | null;
  seen: ReadonlySet<string>;
}

/** Whether the parents from `at` upwards lead back to the document the climb started from. */
const leadsBack = async (after: After, { at, ...climb }: Climb): Promise<boolean> => {
  if (at === null) return false;
  if (at === climb.start) return true;
  if (climb.seen.has(at)) return false;
  const place = await after({ collection: climb.collection, id: at });
  return leadsBack(after, { ...climb, at: place?.parent ?? null, seen: new Set([...climb.seen, at]) });
};

/** Section 4.2 of the spec: what is wrong with where a document is after the commit that put it there. */
const wrongWith =
  (after: After, { trees }: Grove) =>
  async ({ op }: Felling): Promise<string | undefined> => {
    if (op.op === "delete" || !trees.has(op.collection)) return undefined;
    const parent = parentIn(op.data);
    if (parent === null) return undefined;
    const above = await after({ collection: op.collection, id: parent });
    if (above === null) return `its parent ${parent} does not exist`;
    const climb = { collection: op.collection, start: op.id, at: above.parent, seen: new Set<string>() };
    return (await leadsBack(after, climb)) ? "it would be its own ancestor" : undefined;
  };

export interface Planned {
  grove: Grove;
  plan: Plan;
}

/**
 * What a commit does to the trees of its scope. It is refused for the first op that would leave its tree document with
 * a missing parent or in a cycle.
 */
export const planned = async (tx: Reader, { grove, before }: { grove: Grove; before: Before }): Promise<Outcome<Planned>> => {
  const whole = { grove, plan: await cascaded(tx, { grove, before }) };
  const wrong = await inTurn(whole.plan.pending, wrongWith(afterOf(tx, whole), grove));
  const opIndex = wrong.findIndex((found) => found !== undefined);
  return opIndex === -1 ? ok(whole) : refuse({ error: "Conflict", message: `op ${opIndex}: ${wrong[opIndex]}`, opIndex });
};
