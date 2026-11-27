import type { Capability } from "@agentpages/protocol";
import { ACCESS_CASES, HOST_CASES } from "./access.js";
import { COMMON_CASES } from "./common.js";
import { featureCasesOf } from "./features.js";
import type { Cases } from "./kit.js";
import { PAGES_CASES } from "./pages.js";
import { RETRY_CASES } from "./retries.js";
import { TYPES_CASES } from "./types.js";

/** What every Store does, whatever features it advertises. No case here needs a feature. */
const CORE_CASES: Cases = {
  ...COMMON_CASES,
  ...ACCESS_CASES,
  ...PAGES_CASES,
  ...HOST_CASES,
  ...TYPES_CASES,
  ...RETRY_CASES,
};

/** The cases of a Store that advertises `capability`: the core, and of each feature what `featureCasesOf` says. */
export const casesOf = (capability: Capability): Cases => ({ ...CORE_CASES, ...featureCasesOf(capability) });
