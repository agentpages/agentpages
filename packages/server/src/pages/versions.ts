import { type PagesVersionsParams, type PagesVersionsResult, TOOL_SCHEMAS } from "@agentpages/protocol";
import { type Handler, list, ok, parsed, query } from "../pipeline/index.js";
import { NEED } from "../access/permits.js";
import type { Principal } from "../access/principal.js";
import { versionsPrefix } from "./keys.js";
import { existingPage } from "./target.js";

export const pagesVersions: Handler<PagesVersionsParams, PagesVersionsResult, Principal> = query(
  TOOL_SCHEMAS.pages_versions,
  {
    target: existingPage(NEED.read),
    run: async ({ params }, tx) => {
      const { rows, next } = await list({ tx, prefix: versionsPrefix(params.pageId), paging: params });
      const versions = rows.map(([, stored]) => stored);
      return ok(parsed(TOOL_SCHEMAS.pages_versions.result, { versions, ...next }));
    },
  },
);
