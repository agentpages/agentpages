import * as v from "valibot";
import {
  CountSchema,
  type ExchangeSchemas,
  IdSchema,
  JsonObjectSchema,
  LimitSchema,
  PagingSchema,
  type Schema,
  TimestampSchema,
  UuidSchema,
} from "../common/schemas.js";
import type { StateCommittedParams, StateMethods } from "./methods.js";
import type { Actor, Change, Commit, Document, Op, Scope } from "./types.js";

export const ScopeSchema: Schema<Scope> = v.picklist(["page", "viewer"]);

export const ActorSchema: Schema<Actor> = v.variant("kind", [
  v.object({ kind: v.literal("viewer"), id: IdSchema }),
  v.object({ kind: v.literal("anonymous") }),
  v.object({ kind: v.literal("agent") }),
]);

export const DocumentSchema: Schema<Document> = v.object({
  collection: IdSchema,
  id: IdSchema,
  data: JsonObjectSchema,
  revision: CountSchema,
  updatedAt: TimestampSchema,
  updatedBy: ActorSchema,
});

const opTarget = { collection: IdSchema, id: IdSchema, ifRevision: v.exactOptional(CountSchema) };

export const OpSchema: Schema<Op> = v.variant("op", [
  v.object({ op: v.literal("put"), data: JsonObjectSchema, ...opTarget }),
  v.object({ op: v.literal("delete"), ...opTarget }),
]);

export const ChangeSchema: Schema<Change> = v.object({
  collection: IdSchema,
  id: IdSchema,
  revision: CountSchema,
  document: v.nullable(DocumentSchema),
});

export const CommitSchema: Schema<Commit> = v.object({
  seq: CountSchema,
  opId: UuidSchema,
  at: TimestampSchema,
  by: ActorSchema,
  changes: v.array(ChangeSchema),
});

export const StateCommittedParamsSchema: Schema<StateCommittedParams> = v.object({
  scope: ScopeSchema,
  commit: CommitSchema,
});

export const STATE_METHOD_SCHEMAS: ExchangeSchemas<StateMethods> = {
  "agentpages/state/get": {
    params: v.object({ scope: ScopeSchema, collection: IdSchema, id: IdSchema }),
    result: v.object({ document: v.nullable(DocumentSchema) }),
  },
  "agentpages/state/list": {
    params: v.intersect([v.object({ scope: ScopeSchema, collection: IdSchema }), PagingSchema]),
    result: v.object({
      documents: v.array(DocumentSchema),
      seq: CountSchema,
      nextCursor: v.exactOptional(v.string()),
    }),
  },
  "agentpages/state/commit": {
    params: v.object({ scope: ScopeSchema, opId: UuidSchema, ops: v.array(OpSchema) }),
    result: v.object({ commit: CommitSchema }),
  },
  "agentpages/state/commits": {
    params: v.object({ scope: ScopeSchema, since: CountSchema, limit: v.exactOptional(LimitSchema) }),
    result: v.object({ commits: v.array(CommitSchema), seq: CountSchema }),
  },
};
