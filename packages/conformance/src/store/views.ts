import { IDENTITY_CASES } from "./identity.js";
import type { Cases } from "./kit.js";
import { STATE_CASES } from "./state.js";
import { TYPED_CASES } from "./typed.js";

/** What a view asks of a Store, and what the tools of section 5.3 of the spec ask in the same words. */
export const VIEW_CASES: Cases = { ...STATE_CASES, ...IDENTITY_CASES, ...TYPED_CASES };
