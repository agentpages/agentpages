import { type Capability, hasFeature } from "@agentpages/protocol";
import { WITHOUT_IDENTITY_CASES, WITHOUT_STATE_CASES } from "./absent.js";
import { ACCESS_CASES, HOST_CASES } from "./access.js";
import { COMMON_CASES } from "./common.js";
import { IDENTITY_CASES, IDENTITY_IN_STATE_CASES } from "./identity.js";
import type { Cases } from "./kit.js";
import { PAGES_CASES } from "./pages.js";
import { RETRY_CASES } from "./retries.js";
import { STATE_CASES } from "./state.js";
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

/** The cases of a Store that advertises `capability`: of each feature, either what it does or that it is not there. */
export const casesOf = (capability: Capability): Cases => {
  const [state, identity] = [hasFeature(capability, "state"), hasFeature(capability, "identity")];
  return {
    ...CORE_CASES,
    ...(state ? STATE_CASES : WITHOUT_STATE_CASES),
    ...(identity ? IDENTITY_CASES : WITHOUT_IDENTITY_CASES),
    ...(state && identity ? IDENTITY_IN_STATE_CASES : {}),
  };
};
