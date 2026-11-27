import { type PagesListResult, type Paging, TOOL_SCHEMAS } from "@agentpages/protocol";
import { type Context, type Handler, list, nothing, ok, parsed, query } from "../pipeline/index.js";
import type { Agent } from "../access/principal.js";
import type { Key } from "../ports/storage.js";
import { metaKey, ownedPrefix } from "./keys.js";

const pageIdIn = (ownedKey: Key): string => ownedKey.slice(ownedKey.lastIndexOf("/") + 1);

export const pagesList: Handler<Paging, PagesListResult, Agent> = query(TOOL_SCHEMAS.pages_list, {
  target: nothing,
  run: async ({ params, principal }: Context<Paging, null, Agent>, tx) => {
    const { rows, next } = await list({ tx, prefix: ownedPrefix(principal.subject), paging: params, reverse: true });
    const stored = await tx.getMany(rows.map(([key]) => metaKey(pageIdIn(key))));
    return ok({ pages: stored.map((page) => parsed(TOOL_SCHEMAS.pages_publish.result, page)), ...next });
  },
});
