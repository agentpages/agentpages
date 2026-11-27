import { type Empty, type PagesDeleteParams, TOOL_SCHEMAS } from "@agentpages/protocol";
import { type Handler, mutation, ok } from "../pipeline/index.js";
import type { Agent } from "../access/principal.js";
import { goneKey, ownedKey, pagePrefix, rememberedBy } from "./keys.js";
import type { Page } from "./records.js";
import { removablePage } from "./target.js";

export const pagesDelete: Handler<PagesDeleteParams, Empty, Agent> = mutation<PagesDeleteParams, Page | null, Empty>(TOOL_SCHEMAS.pages_delete, {
  target: removablePage(),
  remembers: ({ pageId }) => rememberedBy(pageId),
  run: ({ params: { pageId }, principal, target }, tx) => {
    if (target !== null) {
      tx.deleteRange(pagePrefix(pageId));
      tx.delete(ownedKey(principal.subject, target.info));
      tx.put(goneKey(pageId), {});
    }
    return Promise.resolve(ok({}));
  },
});
