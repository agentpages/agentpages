import type { Paging } from "@agentpages/protocol";
import type { Key, Reader } from "@agentpages/storage";
import { countIn, list } from "../pipeline/index.js";
import { type DocumentId, documentKey, revisionKey } from "../state/keys.js";
import type { Before, Pending } from "../state/records.js";
import { type Child, childrenPrefix } from "./keys.js";
import { type Grove, inTurn } from "./place.js";

/** A document that the delete of an ancestor deletes, with its counter. */
export interface Swept extends Child {
  revision: number;
}

/** An op with the descendants it deletes. */
export interface Felling extends Pending {
  swept: Swept[];
}

/** A scope as a commit finds it, with what each of its ops deletes besides its own document. */
export interface Plan {
  seq: number;
  pending: Felling[];
}

interface Hold extends Grove {
  tx: Reader;
  /** The documents the commit has an op on. */
  changed: ReadonlySet<Key>;
}

interface Rows {
  prefix: Key;
  paging: Paging;
}

/** The id of every row under a prefix, however many scans that takes. */
const idsUnder = async (tx: Reader, { prefix, paging }: Rows): Promise<string[]> => {
  const { rows, next } = await list({ tx, prefix, paging });
  const ids = rows.map(([key]) => key.slice(prefix.length));
  return next === undefined ? ids : [...ids, ...(await idsUnder(tx, { prefix, paging: { cursor: next.nextCursor } }))];
};

/**
 * Section 4.2 of the spec: the descendants of a document in the state after all the ops, a parent before its children
 * and siblings by id. A document the commit has an op on is no descendant: its op says where it is.
 */
const under = async (hold: Hold, { collection, id: parent }: DocumentId): Promise<Child[]> => {
  const ids = await idsUnder(hold.tx, { prefix: childrenPrefix(hold.scope, { collection, id: parent }), paging: {} });
  const children = ids
    .map((id) => ({ collection, id, parent }))
    .filter((child) => !hold.changed.has(documentKey(hold.scope, child)));
  const below = await inTurn(children, async (child) => [child, ...(await under(hold, child))]);
  return below.flat();
};

const counted = async ({ tx, scope }: Hold, found: Child[]): Promise<Swept[]> => {
  const counters = await tx.getMany(found.map((child) => revisionKey(scope, child)));
  return found.map((child, index) => ({ ...child, revision: countIn(counters[index], "revision") }));
};

const felling =
  (hold: Hold) =>
  async (pending: Pending): Promise<Felling> => {
    const { op } = pending;
    const fells = op.op === "delete" && hold.trees.has(op.collection);
    return { ...pending, swept: fells ? await counted(hold, await under(hold, op)) : [] };
  };

/** What a commit deletes besides the documents of its ops: the descendants of every tree document it deletes. */
export const cascaded = async (tx: Reader, { grove, before }: { grove: Grove; before: Before }): Promise<Plan> => {
  const changed = new Set(before.pending.map(({ op }) => documentKey(grove.scope, op)));
  return { seq: before.seq, pending: await inTurn(before.pending, felling({ ...grove, tx, changed })) };
};
