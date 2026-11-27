import { utf8Length } from "../common/bytes.js";
import type { JsonObject } from "../common/types.js";
import type { Problem } from "../errors/types.js";
import type { StateLimits } from "../extension/types.js";
import type { Op } from "./types.js";

export interface CommitCheck {
  ops: Op[];
  limits: StateLimits;
}

const tooManyOps = ({ ops, limits }: CommitCheck): Problem | undefined =>
  ops.length > limits.maxOpsPerCommit
    ? { error: "InvalidParams", message: `${ops.length} ops are more than maxOpsPerCommit ${limits.maxOpsPerCommit}` }
    : undefined;

const sameDocument = (one: Op, other: Op): boolean => one.collection === other.collection && one.id === other.id;

const repeatedDocument = (ops: Op[]): Problem | undefined => {
  const opIndex = ops.findIndex((op, index) => ops.findIndex((first) => sameDocument(first, op)) !== index);
  return opIndex === -1
    ? undefined
    : { error: "InvalidParams", message: `op ${opIndex} is the second op on its document`, opIndex };
};

/** Why a commit of well-formed ops is still malformed: too many ops, or two on one document. */
export const commitProblem = (check: CommitCheck): Problem | undefined =>
  tooManyOps(check) ?? repeatedDocument(check.ops);

/** A delete carries no data, which measures as zero bytes. */
const dataBytes = ({ data }: Pick<Op, "op"> & { data?: JsonObject }): number => utf8Length(JSON.stringify(data));

/** The op whose data is beyond the Store's limit, if any. It is the last thing checked of a request. */
export const commitLimitProblem = ({ ops, limits }: CommitCheck): Problem | undefined => {
  const opIndex = ops.findIndex((op) => dataBytes(op) > limits.maxDocumentBytes);
  return opIndex === -1
    ? undefined
    : {
        error: "LimitExceeded",
        message: `data of op ${opIndex} is larger than maxDocumentBytes ${limits.maxDocumentBytes}`,
        opIndex,
      };
};
