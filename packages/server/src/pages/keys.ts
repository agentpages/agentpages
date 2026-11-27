import type { PageInfo } from "@agentpages/protocol";
import { counted, segment } from "../pipeline/index.js";
import type { Key } from "@agentpages/storage";

export interface VersionOf {
  pageId: string;
  version: number;
}

/** Everything of one page lives under this, so deleting the page is deleting one range. */
export const pagePrefix = (pageId: string): Key => `page/${pageId}/`;

/** The page with its owner. It is also the lock of the page. */
export const metaKey = (pageId: string): Key => `${pagePrefix(pageId)}meta`;

export const versionsPrefix = (pageId: string): Key => `${pagePrefix(pageId)}v/`;

/** When a version was published. */
export const versionKey = ({ pageId, version }: VersionOf): Key => `${versionsPrefix(pageId)}${counted(version)}`;

/** What a version was published with. */
export const contentKey = ({ pageId, version }: VersionOf): Key => `${pagePrefix(pageId)}c/${counted(version)}`;

export const rememberedPrefix = (pageId: string): Key => `${pagePrefix(pageId)}op/`;

/** Kept for ever, so that a deleted `pageId` is never used again. */
export const goneKey = (pageId: string): Key => `gone/${pageId}`;

export const ownedPrefix = (subject: string): Key => `owner/${segment(subject)}/`;

/** One owner's pages in the order of their `updatedAt`, each as `pages_list` shows it. */
export const ownedKey = (subject: string, { updatedAt, pageId }: Pick<PageInfo, "pageId" | "updatedAt">): Key =>
  `${ownedPrefix(subject)}${updatedAt}/${pageId}`;
