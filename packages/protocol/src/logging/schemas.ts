import * as v from "valibot";
import { CountSchema, type Schema, TimestampSchema, UuidSchema } from "../common/schemas.js";
import { ActorSchema, ScopeSchema } from "../state/schemas.js";
import type { LogRecord } from "./types.js";

export const LogRecordSchema: Schema<LogRecord> = v.object({
  at: TimestampSchema,
  requestId: v.string(),
  opId: v.exactOptional(UuidSchema),
  pageId: v.exactOptional(UuidSchema),
  scope: v.exactOptional(ScopeSchema),
  seq: v.exactOptional(CountSchema),
  actor: ActorSchema,
  method: v.string(),
  outcome: v.picklist(["ok", "error"]),
  error: v.exactOptional(v.string()),
  cause: v.exactOptional(v.string()),
  durationMs: v.number(),
});
