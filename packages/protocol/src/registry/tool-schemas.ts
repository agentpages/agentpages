import * as v from "valibot";
import { COMMENTS_TOOL_SCHEMAS } from "../comments/schemas.js";
import { type ExchangeSchemas, type Schema, UuidSchema } from "../common/schemas.js";
import { PAGES_TOOL_SCHEMAS } from "../pages/schemas.js";
import { RENDER_TOOL_SCHEMAS } from "../render/schemas.js";
import { TYPES_TOOL_SCHEMAS } from "../types/schemas.js";
import { METHOD_SCHEMAS } from "./method-schemas.js";
import type { MethodTools, Tools } from "./tools.js";

interface Schemas<Params, Result> {
  readonly params: Schema<Params>;
  readonly result: Schema<Result>;
}

const PageIdSchema: Schema<{ pageId: string }> = v.object({ pageId: UuidSchema });

const ofPage = <Params, Result>(method: Schemas<Params, Result>): Schemas<Params & { pageId: string }, Result> => ({
  params: v.intersect([method.params, PageIdSchema]),
  result: method.result,
});

const METHOD_TOOL_SCHEMAS: ExchangeSchemas<MethodTools> = {
  state_get: ofPage(METHOD_SCHEMAS["agentpages/state/get"]),
  state_list: ofPage(METHOD_SCHEMAS["agentpages/state/list"]),
  state_commit: ofPage(METHOD_SCHEMAS["agentpages/state/commit"]),
  state_commits: ofPage(METHOD_SCHEMAS["agentpages/state/commits"]),
  files_put: ofPage(METHOD_SCHEMAS["agentpages/files/put"]),
  files_get: ofPage(METHOD_SCHEMAS["agentpages/files/get"]),
  files_list: ofPage(METHOD_SCHEMAS["agentpages/files/list"]),
  files_delete: ofPage(METHOD_SCHEMAS["agentpages/files/delete"]),
};

export const TOOL_SCHEMAS: ExchangeSchemas<Tools> = {
  ...METHOD_TOOL_SCHEMAS,
  ...PAGES_TOOL_SCHEMAS,
  ...COMMENTS_TOOL_SCHEMAS,
  ...RENDER_TOOL_SCHEMAS,
  ...TYPES_TOOL_SCHEMAS,
};
