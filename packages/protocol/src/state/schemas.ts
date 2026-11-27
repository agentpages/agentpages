import * as v from "valibot";
import { exchange, sealed } from "../common/seal.js";
import type { ExchangeSchemas, Schema } from "../common/validate.js";
import {
  CountSchema,
  IdSchema,
  JsonObjectSchema,
  LimitSchema,
  ofPage,
  PagingSchema,
  type Raw,
  TimestampSchema,
  UuidSchema,
} from "../common/schemas.js";
import type { ToolsOf } from "../extension/names.js";
import type { StateMethods } from "./methods.js";
import type { Actor, Commit, Committed, Document, Op, Scope } from "./types.js";

type StateTools = ToolsOf<StateMethods>;

export const ScopeSchema: Raw<Scope> = v.picklist(["page", "viewer"]);

export const ActorSchema: Raw<Actor> = v.variant("kind", [
  v.object({ kind: v.literal("viewer"), id: IdSchema }),
  v.object({ kind: v.literal("anonymous") }),
  v.object({ kind: v.literal("agent") }),
]);

const DocumentSchema: Raw<Document> = v.object({
  collection: IdSchema,
  id: IdSchema,
  data: JsonObjectSchema,
  revision: CountSchema,
  updatedAt: TimestampSchema,
  updatedBy: ActorSchema,
});

const opTarget = { collection: IdSchema, id: IdSchema, ifRevision: v.exactOptional(CountSchema) };

const OpSchema: Raw<Op> = v.variant("op", [
  v.object({ op: v.literal("put"), data: JsonObjectSchema, ...opTarget }),
  v.object({ op: v.literal("delete"), ...opTarget }),
]);

const CommitSchema: Raw<Commit> = v.object({
  seq: CountSchema,
  opId: UuidSchema,
  at: TimestampSchema,
  by: ActorSchema,
  changes: v.array(
    v.object({ collection: IdSchema, id: IdSchema, revision: CountSchema, document: v.nullable(DocumentSchema) }),
  ),
});

export const CommittedSchema: Schema<Committed> = sealed(v.object({ scope: ScopeSchema, commit: CommitSchema }));

const get = v.object({ scope: ScopeSchema, collection: IdSchema, id: IdSchema });
const got = v.object({ document: v.nullable(DocumentSchema) });
const list = v.intersect([v.object({ scope: ScopeSchema, collection: IdSchema }), PagingSchema]);
const listed = v.object({
  documents: v.array(DocumentSchema),
  seq: CountSchema,
  nextCursor: v.exactOptional(v.string()),
});
const commit = v.object({ scope: ScopeSchema, opId: UuidSchema, ops: v.array(OpSchema) });
const committed = v.object({ commit: CommitSchema });
const commits = v.object({ scope: ScopeSchema, since: CountSchema, limit: v.exactOptional(LimitSchema) });
const followed = v.object({ commits: v.array(CommitSchema), seq: CountSchema });

export const STATE_METHOD_SCHEMAS: ExchangeSchemas<StateMethods> = {
  "agentpages/state/get": exchange(get, got),
  "agentpages/state/list": exchange(list, listed),
  "agentpages/state/commit": exchange(commit, committed),
  "agentpages/state/commits": exchange(commits, followed),
};

export const STATE_TOOL_PARAMS: { readonly [T in keyof StateTools]: Raw<StateTools[T]["params"]> } = {
  state_get: ofPage(get),
  state_list: ofPage(list),
  state_commit: ofPage(commit),
  state_commits: ofPage(commits),
};

export const STATE_TOOL_SCHEMAS: ExchangeSchemas<StateTools> = {
  state_get: exchange(STATE_TOOL_PARAMS.state_get, got),
  state_list: exchange(STATE_TOOL_PARAMS.state_list, listed),
  state_commit: exchange(STATE_TOOL_PARAMS.state_commit, committed),
  state_commits: exchange(STATE_TOOL_PARAMS.state_commits, followed),
};
