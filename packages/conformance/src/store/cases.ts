import type { Capability } from "@agentpages/protocol";
import { CORE_CASES } from "./core.js";
import { featureCasesOf } from "./features.js";
import type { Cases } from "./kit.js";

/** The cases of a Store that advertises `capability`: the core, and of each feature what `featureCasesOf` says. */
export const casesOf = (capability: Capability): Cases => ({ ...CORE_CASES, ...featureCasesOf(capability) });
