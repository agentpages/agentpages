import { type PageInfo, type PagesGetResult, TOOL_SCHEMAS } from "@agentpages/protocol";
import { parsed, recordOf } from "../pipeline/index.js";
import type { Reader, Tx, Value } from "../ports/storage.js";
import { contentKey, metaKey, ownedKey } from "./keys.js";
import { type Link, urlOf } from "./url.js";

export interface Page {
  owner: unknown;
  info: PageInfo;
}

export const pageOf = (stored: Value): Page => ({
  owner: recordOf(stored).owner,
  info: parsed(TOOL_SCHEMAS.pages_publish.result, stored),
});

export interface VersionRead {
  tx: Reader;
  page: Page;
  version: number;
}

/** One version as `pages_get` returns it: what it was published with, and the page's access as it is now. */
export const readVersion = async ({ tx, page, version }: VersionRead): Promise<PagesGetResult | undefined> => {
  const { pageId, access, url, updatedAt } = page.info;
  const stored = await tx.get(contentKey({ pageId, version }));
  return stored === undefined
    ? undefined
    : parsed(TOOL_SCHEMAS.pages_get.result, { ...recordOf(stored), version, access, url, updatedAt });
};

/** What a page keeps from one version to the next. */
export type Kept = Pick<PageInfo, "pageId" | "version" | "access" | "url" | "updatedAt">;

/** A page before its first version. It is private, and its link has a secret from the start. */
export const unpublished = (link: Link, at: string): Kept => ({
  pageId: link.pageId,
  version: 0,
  access: "private",
  url: urlOf(link),
  updatedAt: at,
});

export interface PageSave {
  tx: Tx;
  owner: string;
  before: Pick<PageInfo, "pageId" | "updatedAt">;
  info: PageInfo;
}

/** Saves the page and moves it to its new place among its owner's pages. */
export const savePage = ({ tx, owner, before, info }: PageSave): void => {
  tx.delete(ownedKey(owner, before));
  tx.put(ownedKey(owner, info), {});
  tx.put(metaKey(info.pageId), { ...info, owner });
};
