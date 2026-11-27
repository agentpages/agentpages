import type { Change, Commit } from "@agentpages/protocol";
import type { Key, Tx } from "@agentpages/storage";
import { metaKey } from "../pages/keys.js";
import { keep } from "../pipeline/index.js";
import type { Planned } from "../trees/check.js";
import { saveRows } from "../trees/rows.js";
import { documentKey, headKey, logKey, revisionKey } from "./keys.js";

const saveChange =
  (tx: Tx, scope: Key) =>
  (change: Change): void => {
    tx.put(revisionKey(scope, change), { revision: change.revision });
    if (change.document === null) tx.delete(documentKey(scope, change));
    else tx.put(documentKey(scope, change), { ...change.document });
  };

export interface Saving {
  whole: Planned;
  commit: Commit;
  /** The page of the scope. */
  pageId: string;
}

/**
 * Writes a commit: every counter and document it changes, where its tree documents are, its place in the log with a
 * note of when, and the new head.
 */
export const saveCommit = (tx: Tx, { whole, commit, pageId }: Saving): void => {
  const { scope } = whole.grove;
  commit.changes.forEach(saveChange(tx, scope));
  saveRows(tx, whole);
  tx.put(logKey(scope, commit.seq), { ...commit });
  keep(tx, { kind: "commit", at: commit.at, row: logKey(scope, commit.seq), lock: metaKey(pageId) });
  tx.put(headKey(scope), { seq: commit.seq });
};
