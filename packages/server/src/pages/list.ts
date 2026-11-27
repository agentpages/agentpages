import { type PagesListResult, type Paging, TOOL_SCHEMAS } from "@agentpages/protocol";
import { type Context, type Handler, list, nothing, ok, parsed, query } from "../pipeline/index.js";
import type { Agent } from "../access/principal.js";
import { ownedPrefix } from "./keys.js";

export const pagesList: Handler<Paging, PagesListResult, Agent> = query(TOOL_SCHEMAS.pages_list, {
  target: nothing,
  run: async ({ params, principal }: Context<Paging, null, Agent>, tx) => {
    const { rows, next } = await list({ tx, prefix: ownedPrefix(principal.subject), paging: params, reverse: true });
    return ok({ pages: rows.map(([, stored]) => parsed(TOOL_SCHEMAS.pages_publish.result, stored)), ...next });
  },
});
