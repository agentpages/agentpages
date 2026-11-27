import type { Empty } from "../common/types.js";
import type { Viewer } from "./types.js";

export interface IdentityGetResult {
  viewer: Viewer | null;
}

export interface IdentityMethods {
  "agentpages/identity/get": { params: Empty; result: IdentityGetResult };
}
