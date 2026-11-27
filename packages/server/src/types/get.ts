import { TOOL_SCHEMAS, type TypesGetParams, type TypesGetResult } from "@agentpages/protocol";
import { type Handler, ok, parsed, query, refuse } from "../pipeline/index.js";
import type { Principal } from "../access/principal.js";
import { typeVersionKey } from "./keys.js";
import { existingType } from "./target.js";

export const typesGet: Handler<TypesGetParams, TypesGetResult, Principal> = query(TOOL_SCHEMAS.types_get, {
  target: existingType<TypesGetParams>(),
  run: async ({ params: { typeId, version }, target }, tx) => {
    const typeVersion = version ?? target.info.version;
    const stored = await tx.get(typeVersionKey({ typeId, typeVersion }));
    return stored === undefined
      ? refuse({ error: "NotFound", message: `The type ${typeId} has no version ${typeVersion}.` })
      : ok(parsed(TOOL_SCHEMAS.types_get.result, stored));
  },
});
