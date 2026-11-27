import type { Op } from "@agentpages/protocol";
import { countIn } from "../pipeline/index.js";
import type { Key, Reader } from "@agentpages/storage";
import { documentKey, headKey, revisionKey } from "./keys.js";

/** The `seq` of the last commit of a scope, which is 0 before its first. */
export const seqOf = async (tx: Reader, scope: Key): Promise<number> => countIn(await tx.get(headKey(scope)), "seq");

/** An op with what the Store holds of its document. */
export interface Pending {
  op: Op;
  revision: number;
  exists: boolean;
}

/** A scope as a commit finds it. */
export interface Before {
  seq: number;
  pending: Pending[];
}

/** One read of everything a commit depends on: the head of the log, and the counter and the document of every op. */
export const readBefore = async (tx: Reader, { scope, ops }: { scope: Key; ops: Op[] }): Promise<Before> => {
  const counters = ops.map((op) => revisionKey(scope, op));
  const documents = ops.map((op) => documentKey(scope, op));
  const [head, ...rows] = await tx.getMany([headKey(scope), ...counters, ...documents]);
  return {
    seq: countIn(head, "seq"),
    pending: ops.map((op, index) => ({
      op,
      revision: countIn(rows[index], "revision"),
      exists: rows[ops.length + index] !== undefined,
    })),
  };
};
