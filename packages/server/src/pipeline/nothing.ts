import type { Target } from "./operation.js";
import { ok } from "./outcome.js";

/** The target of a request that names neither a page nor a type. It takes no lock. */
export const nothing: Target<unknown, null> = () => ({
  names: {},
  locks: [],
  find: () => Promise.resolve(ok(null)),
});
