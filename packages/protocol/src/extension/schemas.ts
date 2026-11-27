import * as v from "valibot";
import { VERSION_PATTERN } from "../common/patterns.js";
import { CountSchema, EmptySchema } from "../common/schemas.js";
import { sealed } from "../common/seal.js";
import type { Schema } from "../common/validate.js";
import type { Capability } from "./types.js";

export const CapabilitySchema: Schema<Capability> = sealed(
  v.object({
    version: v.pipe(v.string(), v.regex(VERSION_PATTERN)),
    limits: v.object({
      requestTimeoutMs: CountSchema,
      syncIntervalMs: CountSchema,
      exportTimeoutMs: CountSchema,
      maxHtmlBytes: CountSchema,
      maxSchemaBytes: CountSchema,
      opRetentionSeconds: CountSchema,
      commitRetentionSeconds: CountSchema,
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
