import type { Problem } from "../errors/types.js";
import type { FilesLimits } from "../extension/types.js";

const paddingOf = (blob: string): number => Number(blob.endsWith("=")) + Number(blob.endsWith("=="));

/** The decoded length in bytes of a base64 `blob`. */
export const base64Size = (blob: string): number => (blob.length / 4) * 3 - paddingOf(blob);

/** The file limit a well-formed `blob` breaks, if any. */
export const fileProblem = ({ blob, limits }: { blob: string; limits: FilesLimits }): Problem | undefined =>
  base64Size(blob) > limits.maxFileBytes
    ? {
        error: "LimitExceeded",
        message: `file of ${base64Size(blob)} bytes is larger than maxFileBytes ${limits.maxFileBytes}`,
      }
    : undefined;
