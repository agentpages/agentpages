import type { Feature } from "./constants.js";
import type { Capability } from "./types.js";

/** A feature is available exactly when its key is present. */
export const hasFeature = (capability: Capability, feature: Feature): boolean => Object.hasOwn(capability, feature);
