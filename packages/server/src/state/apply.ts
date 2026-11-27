import type { Actor, Change, Commit } from "@agentpages/protocol";
import type { Refusal } from "../pipeline/index.js";
import type { Felling, Plan, Swept } from "../trees/cascade.js";
import { type Before, isChange, type Pending } from "./records.js";

/** `ifRevision: 0` asks that the document does not exist. Any other asks for the value of its counter. */
const isStale = ({ op: { ifRevision }, revision, stored }: Pending): boolean => {
  if (ifRevision === undefined) return false;
  return ifRevision === 0 ? stored !== undefined : ifRevision !== revision;
};

/** Section 4.1 of the spec: the first op whose `ifRevision` no longer holds. */
export const stale = ({ pending }: Before): Refusal | undefined => {
  const opIndex = pending.findIndex(isStale);
  return opIndex === -1 ? undefined : { error: "Conflict", message: `The ifRevision of op ${opIndex} no longer holds.`, opIndex };
};

/** When a commit is made, by whom, and under which `opId`. */
export interface Stamp {
  opId: string;
  at: string;
  by: Actor;
}

const deleted = ({ collection, id, revision }: Swept): Change => ({ collection, id, revision: revision + 1, document: null });

const ownChange = ({ at, by }: Stamp, pending: Pending): Change[] => {
  if (!isChange(pending)) return [];
  const { op, revision } = pending;
  const counted = { collection: op.collection, id: op.id, revision: revision + 1 };
  return [{ ...counted, document: op.op === "put" ? { ...counted, data: op.data, updatedAt: at, updatedBy: by } : null }];
};

const changesOf =
  (stamp: Stamp) =>
  (felling: Felling): Change[] => [...ownChange(stamp, felling), ...felling.swept.map(deleted)];

/**
 * The next commit of a scope: what its ops change, in their order, each delete followed by the descendants it deletes.
 * A delete of a missing document changes nothing.
 */
export const applied = ({ seq, pending }: Plan, stamp: Stamp): Commit => ({
  seq: seq + 1,
  ...stamp,
  changes: pending.flatMap(changesOf(stamp)),
});
