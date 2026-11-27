import type { Key, Tx } from "@agentpages/storage";
import type { DocumentId } from "../state/keys.js";
import type { Felling } from "./cascade.js";
import type { Planned } from "./check.js";
import { childKey } from "./keys.js";
import { type Grove, parentIn, parentOf } from "./place.js";

interface Placed {
  scope: Key;
  named: DocumentId;
  parent: string | null;
}

/** The row that says where a document is. A root has none. */
const rowsOf = ({ scope, named, parent }: Placed): Key[] => (parent === null ? [] : [childKey(scope, { ...named, parent })]);

const move =
  (tx: Tx, { scope, trees }: Grove) =>
  ({ op, stored, swept }: Felling): void => {
    if (!trees.has(op.collection)) return;
    const was = stored === undefined ? [] : rowsOf({ scope, named: op, parent: parentOf(stored) });
    const now = op.op === "put" ? rowsOf({ scope, named: op, parent: parentIn(op.data) }) : [];
    [...was, ...swept.map((gone) => childKey(scope, gone))].forEach((row) => {
      tx.delete(row);
    });
    now.forEach((row) => {
      tx.put(row, {});
    });
  };

/** Moves the row of every tree document a commit changes, so that the children of a document are one scan away. */
export const saveRows = (tx: Tx, { grove, plan }: Planned): void => {
  plan.pending.forEach(move(tx, grove));
};
