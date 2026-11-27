import type { Change, Commit } from "@agentpages/protocol";
import type { Key, Tx } from "@agentpages/storage";
import { documentKey, headKey, logKey, revisionKey } from "./keys.js";

const saveChange =
  (tx: Tx, scope: Key) =>
  (change: Change): void => {
    tx.put(revisionKey(scope, change), { revision: change.revision });
    if (change.document === null) tx.delete(documentKey(scope, change));
    else tx.put(documentKey(scope, change), { ...change.document });
  };

/** Writes a commit: every counter and document it changes, its place in the log, and the new head. */
export const saveCommit = (tx: Tx, { scope, commit }: { scope: Key; commit: Commit }): void => {
  commit.changes.forEach(saveChange(tx, scope));
  tx.put(logKey(scope, commit.seq), { ...commit });
  tx.put(headKey(scope), { seq: commit.seq });
};
