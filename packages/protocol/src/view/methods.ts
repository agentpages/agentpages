import type { Empty } from "../common/types.js";

export interface ViewRevealParams {
  collection: string;
  id: string;
}

export interface ViewExportParams {
  format: string;
}

export interface ViewExportResult {
  blob: string;
}

export interface ViewMethods {
  "agentpages/view/reveal": { params: ViewRevealParams; result: Empty };
  "agentpages/view/export": { params: ViewExportParams; result: ViewExportResult };
}
