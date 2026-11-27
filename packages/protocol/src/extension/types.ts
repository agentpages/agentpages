import type { Empty } from "../common/types.js";

export interface Limits {
  requestTimeoutMs: number;
  syncIntervalMs: number;
  exportTimeoutMs: number;
  maxHtmlBytes: number;
  maxSchemaBytes: number;
  opRetentionSeconds: number;
  commitRetentionSeconds: number;
}

export interface StateLimits {
  maxDocumentBytes: number;
  maxOpsPerCommit: number;
  maxTreeDepth: number;
  liveChanges: boolean;
}

export interface FilesLimits {
  maxFileBytes: number;
}

export interface RenderLimits {
  maxWidth: number;
  maxHeight: number;
  maxDocumentHeight: number;
  settleTimeoutMs: number;
}

/** What a Store or a host advertises under the extension identifier. */
export interface Capability {
  version: string;
  limits: Limits;
  state?: StateLimits;
  identity?: Empty;
  files?: FilesLimits;
  render?: RenderLimits;
}
