import * as v from "valibot";
import { VERSION_PATTERN } from "../common/patterns.js";
import { EmptySchema, matching, type Schema } from "../common/schemas.js";
import type { Capability } from "./types.js";

export const CapabilitySchema: Schema<Capability> = v.object({
  version: matching(VERSION_PATTERN),
  limits: v.object({
    requestTimeoutMs: v.number(),
    syncIntervalMs: v.number(),
    exportTimeoutMs: v.number(),
    maxHtmlBytes: v.number(),
    opRetentionSeconds: v.number(),
    commitRetentionSeconds: v.number(),
  }),
  state: v.exactOptional(
    v.object({ maxDocumentBytes: v.number(), maxOpsPerCommit: v.number(), liveChanges: v.boolean() }),
  ),
  identity: v.exactOptional(EmptySchema),
  files: v.exactOptional(v.object({ maxFileBytes: v.number() })),
  render: v.exactOptional(
    v.object({
      maxWidth: v.number(),
      maxHeight: v.number(),
      maxDocumentHeight: v.number(),
      settleTimeoutMs: v.number(),
    }),
  ),
});
