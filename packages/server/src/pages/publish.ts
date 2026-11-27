import { htmlProblem, type PageInfo, type PagesPublishParams, TOOL_SCHEMAS } from "@agentpages/protocol";
import { type Handler, mutation, ok, parsed, refuse } from "../pipeline/index.js";
import type { Agent } from "../access/principal.js";
import { typeVersionKey } from "../types/keys.js";
import { contentKey, rememberedPrefix, versionKey } from "./keys.js";
import { savePage, unpublished } from "./records.js";
import { publishablePage } from "./target.js";

/** The html of a version. A typed page has none of its own. */
const htmlOf = ({ html = "" }: { kind: string; html?: string }): string => html;

export const pagesPublish: Handler<PagesPublishParams, PageInfo, Agent> = mutation(TOOL_SCHEMAS.pages_publish, {
  target: publishablePage<PagesPublishParams>(({ content }) => (content.kind === "type" ? [typeVersionKey(content)] : [])),
  remembers: ({ pageId }) => rememberedPrefix(pageId),
  limits: ({ content }, { limits }) => htmlProblem({ html: htmlOf(content), limits }),
  run: ({ params, principal, target, at, deps: { baseUrl, ids } }, tx) => {
    const { pageId, baseVersion } = params;
    const before = target?.info ?? unpublished({ baseUrl, pageId, secret: ids.secret() }, at);
    if (baseVersion !== before.version) {
      const message = `baseVersion ${baseVersion} is not the current version ${before.version}.`;
      return Promise.resolve(refuse({ error: "Conflict", message }));
    }
    const published = { ...params, version: baseVersion + 1, access: before.access, url: before.url, updatedAt: at };
    const info = parsed(TOOL_SCHEMAS.pages_publish.result, published);
    tx.put(contentKey(info), { ...params });
    tx.put(versionKey(info), { version: info.version, createdAt: at });
    savePage({ tx, owner: principal.subject, before, info });
    return Promise.resolve(ok(info));
  },
});
