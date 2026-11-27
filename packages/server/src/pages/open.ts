import { HOST_OPERATION_SCHEMAS, type Opened, type PagesOpenParams, TOOL_SCHEMAS } from "@agentpages/protocol";
import { type Handler, ok, parsed, query } from "../pipeline/index.js";
import { NEED } from "../access/permits.js";
import type { Principal } from "../access/principal.js";
import { typeVersionKey } from "../types/keys.js";
import { readVersion } from "./records.js";
import { linkedPage } from "./target.js";

export const pagesOpen: Handler<PagesOpenParams, Opened, Principal> = query(HOST_OPERATION_SCHEMAS.pages_open, {
  target: linkedPage<PagesOpenParams>(NEED.read),
  run: async ({ target: page }, tx) => {
    const current = await readVersion({ tx, page, version: page.info.version });
    const { content } = parsed(TOOL_SCHEMAS.pages_get.result, current);
    if (content.kind === "html") return ok(parsed(HOST_OPERATION_SCHEMAS.pages_open.result, { page: page.info, view: content }));
    const type = parsed(TOOL_SCHEMAS.types_get.result, await tx.get(typeVersionKey(content)));
    return ok(parsed(HOST_OPERATION_SCHEMAS.pages_open.result, { page: page.info, view: type.content, type }));
  },
});
