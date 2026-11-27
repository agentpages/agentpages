import { type Heads, HOST_OPERATION_SCHEMAS, type Presented } from "@agentpages/protocol";
import type { Visitor } from "../access/principal.js";
import { headKey as commentsHead } from "../comments/keys.js";
import { changesIn } from "../comments/records.js";
import { type Handler, ok, type Place, query } from "../pipeline/index.js";
import { headKey, pageScope, viewerScope } from "../state/keys.js";
import { seqIn } from "../state/records.js";
import { metaKey } from "./keys.js";
import { linked, readPage } from "./target.js";

/**
 * Where the page with this `pageId` stands, for a viewer who presents `url` and may read the page. It is one read of
 * the page and its heads, under no lock: a host asks often, and no writer waits for it.
 */
const headsAt = (pageId: string, url: string): Place<Presented, Heads, Visitor> => ({
  names: { pageId },
  locks: [],
  find: async ({ principal }, tx) => {
    const own = principal.kind === "viewer" ? [headKey(viewerScope(pageId, principal.subject))] : [];
    const [meta, comments, seq, ...mine] = await tx.getMany([metaKey(pageId), commentsHead(pageId), headKey(pageScope(pageId)), ...own]);
    const page = readPage(meta, { principal, link: url });
    if (!page.ok) return page;
    const [signedIn] = mine.map((head) => ({ viewerSeq: seqIn(head) }));
    return ok({ version: page.value.info.version, seq: seqIn(seq), ...signedIn, comments: changesIn(comments) });
  },
});

/** Section 5.6 of the spec: the numbers a host compares to learn that a page, its state or its comments changed. */
export const pagesHeads: Handler<Presented, Heads, Visitor> = query<Presented, Heads, Heads, Visitor>(HOST_OPERATION_SCHEMAS.pages_heads, {
  target: linked(headsAt),
  run: ({ target }) => Promise.resolve(ok(target)),
});
