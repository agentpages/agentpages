import { type PagesGetParams, type PagesGetResult, TOOL_SCHEMAS } from "@agentpages/protocol";
import { type Handler, ok, query, refuse } from "../pipeline/index.js";
import { NEED } from "../access/permits.js";
import type { Principal } from "../access/principal.js";
import { readVersion } from "./records.js";
import { existingPage } from "./target.js";

export const pagesGet: Handler<PagesGetParams, PagesGetResult, Principal> = query(TOOL_SCHEMAS.pages_get, {
  target: existingPage<PagesGetParams>(NEED.read),
  run: async ({ params, target: page }, tx) => {
    const version = params.version ?? page.info.version;
    const found = await readVersion({ tx, page, version });
    return found === undefined
      ? refuse({ error: "NotFound", message: `The page has no version ${version}.` })
      : ok(found);
  },
});
