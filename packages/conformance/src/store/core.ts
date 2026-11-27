import { ACCESS_CASES, HOST_CASES } from "./access.js";
import { COMMENTS_CASES } from "./comments.js";
import { COMMON_CASES } from "./common.js";
import type { Cases } from "./kit.js";
import { PAGES_CASES } from "./pages.js";
import { RETRY_CASES } from "./retries.js";
import { TYPES_CASES } from "./types.js";

/** What every Store does, whatever features it advertises. No case here needs a feature. */
export const CORE_CASES: Cases = {
  ...COMMON_CASES,
  ...ACCESS_CASES,
  ...PAGES_CASES,
  ...HOST_CASES,
  ...TYPES_CASES,
  ...RETRY_CASES,
  ...COMMENTS_CASES,
};
