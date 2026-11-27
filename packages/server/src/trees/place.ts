import { TreeNodeSchema } from "@agentpages/protocol";
import type { Key, Value } from "@agentpages/storage";
import { parsed, recordOf } from "../pipeline/index.js";

/** Where the tree rules hold: a scope, and its collections that are trees. */
export interface Grove {
  scope: Key;
  trees: ReadonlySet<string>;
}

/** The parent that the data of a tree document names. Null for a root. */
export const parentIn = (data: unknown): string | null => parsed(TreeNodeSchema, data).parent;

/** The parent of a stored tree document. */
export const parentOf = (stored: Value): string | null => parentIn(recordOf(stored).data);

/** What `each` makes of every item, one after the other. */
export const inTurn = <T, R>(items: readonly T[], each: (item: T) => Promise<R>): Promise<R[]> =>
  items.reduce<Promise<R[]>>(async (earlier, item) => [...(await earlier), await each(item)], Promise.resolve([]));
