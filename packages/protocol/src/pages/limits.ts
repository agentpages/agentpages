import { utf8Length } from "../common/bytes.js";
import type { Problem } from "../errors/types.js";
import type { Limits } from "../extension/types.js";

/** The limit a well-formed `html` breaks, if any. */
export const htmlProblem = ({ html, limits }: { html: string; limits: Limits }): Problem | undefined =>
  utf8Length(html) > limits.maxHtmlBytes
    ? {
        error: "LimitExceeded",
        message: `html of ${utf8Length(html)} bytes is larger than maxHtmlBytes ${limits.maxHtmlBytes}`,
      }
    : undefined;
