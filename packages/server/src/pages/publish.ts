import { htmlProblem, type PageInfo, type PagesPublishParams, TOOL_SCHEMAS } from "@agentpages/protocol";
import { type Handler, mutation, ok, parsed, refuse } from "../pipeline/index.js";
import type { Agent } from "../access/principal.js";
import { typeVersionKey } from "../types/keys.js";
import { contentKey, rememberedBy, versionKey } from "./keys.js";
import { currentContent, type Page, savePage, unpublished } from "./records.js";
import { publishablePage } from "./target.js";

interface Content {
  kind: string;
  html?: string;
  typeId?: string;
}

/** The type a version is of. An html version is of none, so a page keeps its kind exactly when it keeps this. */
const typeOf = ({ typeId }: Content): string | undefined => typeId;

/** The html of a version. A typed page has none of its own. */
const htmlOf = ({ html = "" }: Content): string => html;

export const pagesPublish: Handler<PagesPublishParams, PageInfo, Agent> = mutation<PagesPublishParams, Page | null, PageInfo>(TOOL_SCHEMAS.pages_publish, {
  target: publishablePage(({ content }) => (content.kind === "type" ? [typeVersionKey(content)] : [])),
  remembers: ({ pageId }) => rememberedBy(pageId),
  limits: ({ content }, { limits }) => htmlProblem({ html: htmlOf(content), limits }),
  run: async ({ params, principal, target, at, deps: { baseUrl, ids } }, tx) => {
    const { pageId, baseVersion } = params;
    if (target !== null && typeOf(await currentContent(tx, target)) !== typeOf(params.content)) {
      return refuse({ error: "InvalidParams", message: "A page keeps its kind and its typeId in every version." });
    }
    const before = target?.info ?? unpublished({ baseUrl, pageId, secret: ids.secret() }, at);
    if (baseVersion !== before.version) {
      return refuse({ error: "Conflict", message: `baseVersion ${baseVersion} is not the current version ${before.version}.` });
    }
    const published = { ...params, version: baseVersion + 1, access: before.access, url: before.url, updatedAt: at };
    const info = parsed(TOOL_SCHEMAS.pages_publish.result, published);
    tx.put(contentKey(info), { ...params });
    tx.put(versionKey(info), { version: info.version, createdAt: at });
    savePage({ tx, owner: principal.subject, before, info });
    return ok(info);
  },
});
