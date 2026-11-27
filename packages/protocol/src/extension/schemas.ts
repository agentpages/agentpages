import * as v from "valibot";
import { VERSION_PATTERN } from "../common/patterns.js";
import { CountSchema, EmptySchema, type Raw } from "../common/schemas.js";
import { sealed } from "../common/seal.js";
import type { Schema } from "../common/validate.js";
import type { HostCapability } from "../bridge/types.js";
import type { Capability } from "./types.js";

const hostEntries = {
  version: v.pipe(v.string(), v.regex(VERSION_PATTERN)),
  limits: v.object({
    requestTimeoutMs: CountSchema,
    syncIntervalMs: CountSchema,
    exportTimeoutMs: CountSchema,
    maxHtmlBytes: CountSchema,
    maxSchemaBytes: CountSchema,
    opRetentionSeconds: CountSchema,
    commitRetentionSeconds: CountSchema,
    maxThreadEntries: CountSchema,
  }),
  state: v.exactOptional(
    v.object({
      maxDocumentBytes: CountSchema,
      maxOpsPerCommit: CountSchema,
      maxTreeDepth: CountSchema,
      liveChanges: v.boolean(),
    }),
  ),
  identity: v.exactOptional(EmptySchema),
  files: v.exactOptional(v.object({ maxFileBytes: CountSchema })),
};

/** What a host advertises: a capability whose `render`, if it came with one, is left out. */
export const HostCapabilitySchema: Raw<HostCapability> = v.object(hostEntries);

export const CapabilitySchema: Schema<Capability> = sealed(
  v.object({
    ...hostEntries,
    render: v.exactOptional(
      v.object({
        maxWidth: CountSchema,
        maxHeight: CountSchema,
        maxDocumentHeight: CountSchema,
        settleTimeoutMs: CountSchema,
      }),
    ),
  }),
);
