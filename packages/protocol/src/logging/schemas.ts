import * as v from "valibot";
import { CountSchema, IdSchema, TimestampSchema, UuidSchema } from "../common/schemas.js";
import { sealed } from "../common/seal.js";
import type { Schema } from "../common/validate.js";
import { ActorSchema, ScopeSchema } from "../state/schemas.js";
import type { LogRecord } from "./types.js";

export const LogRecordSchema: Schema<LogRecord> = sealed(
  v.object({
    at: TimestampSchema,
    requestId: IdSchema,
    opId: v.exactOptional(UuidSchema),
    pageId: v.exactOptional(UuidSchema),
    scope: v.exactOptional(ScopeSchema),
    seq: v.exactOptional(CountSchema),
    actor: ActorSchema,
    method: v.string(),
    outcome: v.picklist(["ok", "error"]),
    error: v.exactOptional(v.string()),
    cause: v.exactOptional(v.string()),
    durationMs: CountSchema,
  }),
);
