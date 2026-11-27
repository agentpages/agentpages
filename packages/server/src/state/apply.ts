import type { Actor, Change, Commit } from "@agentpages/protocol";
import type { Before, Pending } from "./records.js";

/** `ifRevision: 0` asks that the document does not exist. Any other asks for the value of its counter. */
const isStale = ({ op: { ifRevision }, revision, exists }: Pending): boolean => {
  if (ifRevision === undefined) return false;
  return ifRevision === 0 ? exists : ifRevision !== revision;
};

/** The position of the first op whose `ifRevision` no longer holds, or -1. */
export const staleIndex = ({ pending }: Before): number => pending.findIndex(isStale);

/** When a commit is made, by whom, and under which `opId`. */
export interface Stamp {
  opId: string;
  at: string;
  by: Actor;
}

const changeOf =
  ({ at, by }: Stamp) =>
  ({ op, revision, exists }: Pending): Change[] => {
    const counted = { collection: op.collection, id: op.id, revision: revision + 1 };
    if (op.op === "put") return [{ ...counted, document: { ...counted, data: op.data, updatedAt: at, updatedBy: by } }];
    return exists ? [{ ...counted, document: null }] : [];
  };

/** The next commit of a scope: what its ops change, in their order. A delete of a missing document changes nothing. */
export const applied = ({ seq, pending }: Before, stamp: Stamp): Commit => ({
  seq: seq + 1,
  ...stamp,
  changes: pending.flatMap(changeOf(stamp)),
});
