import { type Capability, hasFeature } from "@agentpages/protocol";
import { WITHOUT_IDENTITY_CASES, WITHOUT_STATE_CASES } from "./absent.js";
import { CORE_CASES } from "./core.js";
import { IDENTITY_CASES, IDENTITY_IN_STATE_CASES } from "./identity.js";
import type { Cases } from "./kit.js";
import { STATE_CASES } from "./state.js";

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
