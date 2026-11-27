import { type Paging, TOOL_SCHEMAS, TypeInfoSchema, type TypesListResult } from "@agentpages/protocol";
import { type Handler, list, nothing, ok, parsed, query } from "../pipeline/index.js";
import type { Principal } from "../access/principal.js";
import { TYPES_PREFIX } from "./keys.js";

export const typesList: Handler<Paging, TypesListResult, Principal> = query(TOOL_SCHEMAS.types_list, {
  target: nothing,
  run: async ({ params }, tx) => {
    const { rows, next } = await list({ tx, prefix: TYPES_PREFIX, paging: params });
    return ok({ types: rows.map(([, stored]) => parsed(TypeInfoSchema, stored)), ...next });
  },
});
