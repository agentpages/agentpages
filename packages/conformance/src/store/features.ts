import { type Capability, hasFeature } from "@agentpages/protocol";
import { WITHOUT_FILES_CASES, WITHOUT_IDENTITY_CASES, WITHOUT_STATE_CASES } from "./absent.js";
import { FILES_CASES } from "./files.js";
import { HEADS_IN_STATE_CASES } from "./heads.js";
import { IDENTITY_CASES, IDENTITY_IN_STATE_CASES } from "./identity.js";
import type { Cases } from "./kit.js";
import { STATE_CASES } from "./state.js";

/** Of each feature, either what a Store that advertises `capability` does with it, or that it is not there. */
export const featureCasesOf = (capability: Capability): Cases => {
  const [state, identity] = [hasFeature(capability, "state"), hasFeature(capability, "identity")];
  return {
    ...(state ? { ...STATE_CASES, ...HEADS_IN_STATE_CASES } : WITHOUT_STATE_CASES),
    ...(identity ? IDENTITY_CASES : WITHOUT_IDENTITY_CASES),
    ...(state && identity ? IDENTITY_IN_STATE_CASES : {}),
    ...(hasFeature(capability, "files") ? FILES_CASES : WITHOUT_FILES_CASES),
  };
};
