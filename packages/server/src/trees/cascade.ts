import type { Key, Reader } from "@agentpages/storage";
import { countIn, ok, type Outcome, refuse } from "../pipeline/index.js";
import { type DocumentId, documentKey, revisionKey } from "../state/keys.js";
import { type Before, isChange, type Pending } from "../state/records.js";
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

/** A descendant a sweep found, and the op that deletes it. */
interface Found {
  child: Child;
  into: Swept[];
}

interface Sweep extends Grove {
  tx: Reader;
  /** The documents the commit has an op on. */
  changed: ReadonlySet<Key>;
  maxOpsPerCommit: number;
  /** How many more documents the commit may change. Below zero, it is beyond its limit, and the sweep is over. */
  left: number;
  found: Found[];
}

interface Under {
  at: DocumentId;
  into: Swept[];
}

/**
 * Section 4.2 of the spec: the descendants of a document in the state after all the ops, depth first, a parent before
 * its children and siblings by id. A document the commit has an op on is no descendant: its op says where it is. One
 * scan reads the children of a document: more of them than `maxOpsPerCommit` are beyond the limit anyway.
 */
const sweepUnder = async (sweep: Sweep, { at, into }: Under): Promise<void> => {
  const prefix = childrenPrefix(sweep.scope, at);
  const rows = await sweep.tx.scan({ prefix, limit: sweep.maxOpsPerCommit });
  const children = rows
    .map(([key]) => ({ collection: at.collection, id: key.slice(prefix.length), parent: at.id }))
    .filter((child) => !sweep.changed.has(documentKey(sweep.scope, child)));
  await inTurn(children, async (child) => {
    sweep.left -= 1;
    if (sweep.left < 0) return;
    sweep.found.push({ child, into });
    await sweepUnder(sweep, { at: child, into });
  });
};

const felling =
  (sweep: Sweep) =>
  async (pending: Pending): Promise<Felling> => {
    const { op } = pending;
    const swept: Swept[] = [];
    if (op.op === "delete" && sweep.trees.has(op.collection)) await sweepUnder(sweep, { at: op, into: swept });
    return { ...pending, swept };
  };

/** One read of the counter of every descendant the sweep found, when it found any. */
const count = async ({ tx, scope, found }: Sweep): Promise<void> => {
  if (found.length === 0) return;
  const counters = await tx.getMany(found.map(({ child }) => revisionKey(scope, child)));
  found.forEach(({ child, into }, index) => {
    into.push({ ...child, revision: countIn(counters[index], "revision") });
  });
};

export interface Cascading {
  grove: Grove;
  before: Before;
  maxOpsPerCommit: number;
}

/**
 * What a commit deletes besides the documents of its ops: the descendants of every tree document it deletes. Section
 * 4.2 of the spec: with more changes than `maxOpsPerCommit` it is beyond the limit, and the sweep stops there.
 */
export const cascaded = async (tx: Reader, { grove, before, maxOpsPerCommit }: Cascading): Promise<Outcome<Plan>> => {
  const changed = new Set(before.pending.map(({ op }) => documentKey(grove.scope, op)));
  const left = maxOpsPerCommit - before.pending.filter(isChange).length;
  const sweep: Sweep = { ...grove, tx, changed, maxOpsPerCommit, left, found: [] };
  const pending = await inTurn(before.pending, felling(sweep));
  if (sweep.left < 0) {
    return refuse({ error: "LimitExceeded", message: `The changes, descendants included, are more than maxOpsPerCommit ${maxOpsPerCommit}` });
  }
  await count(sweep);
  return ok({ seq: before.seq, pending });
};
