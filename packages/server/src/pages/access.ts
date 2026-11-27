import { type PageInfo, type PagesSetAccessParams, TOOL_SCHEMAS } from "@agentpages/protocol";
import { type Context, type Handler, mutation, ok, type Outcome } from "../pipeline/index.js";
import { NEED } from "../access/permits.js";
import type { Agent } from "../access/principal.js";
import type { Tx } from "@agentpages/storage";
import { rememberedBy } from "./keys.js";
import { type Page, savePage } from "./records.js";
import { existingPage } from "./target.js";
import { urlOf } from "./url.js";

type Sharing = Context<PagesSetAccessParams, Page, Agent>;

/** Leaving `private` issues a new link, so one that was shared before the page became private stays ended. */
const linkFor = ({ params: { pageId }, target, deps }: Sharing): string =>
  target.info.access === "private"
    ? urlOf({ baseUrl: deps.baseUrl, pageId, secret: deps.ids.secret() })
    : target.info.url;

const setAccess = (context: Sharing, tx: Tx): Promise<Outcome<PageInfo>> => {
  const { params, principal, target, at } = context;
  if (params.access === target.info.access) return Promise.resolve(ok(target.info));
  const info = { ...target.info, access: params.access, url: linkFor(context), updatedAt: at };
  savePage({ tx, owner: principal.subject, before: target.info, info });
  return Promise.resolve(ok(info));
};

export const pagesSetAccess: Handler<PagesSetAccessParams, PageInfo, Agent> = mutation(TOOL_SCHEMAS.pages_set_access, {
  target: existingPage(NEED.owner),
  remembers: ({ pageId }) => rememberedBy(pageId),
  run: setAccess,
});
