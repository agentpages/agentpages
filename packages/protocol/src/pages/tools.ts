import type { Empty, Paging } from "../common/types.js";
import type { PageContent, PageInfo } from "./types.js";

export interface PagesPublishParams {
  opId: string;
  pageId: string;
  baseVersion: number;
  title: string;
  description?: string;
  content: PageContent;
}

export interface PagesGetParams {
  pageId: string;
  version?: number;
}

export type PagesGetResult = PageInfo & { content: PageContent };

export interface PagesListResult {
  pages: PageInfo[];
  nextCursor?: string;
}

export interface PagesVersionsParams {
  pageId: string;
  cursor?: string;
  limit?: number;
}

export interface PagesVersionsResult {
  versions: { version: number; createdAt: string }[];
  nextCursor?: string;
}

export interface PagesSetAccessParams {
  opId: string;
  pageId: string;
  access: PageInfo["access"];
}

export interface PagesDeleteParams {
  opId: string;
  pageId: string;
}

export interface PagesTools {
  pages_publish: { params: PagesPublishParams; result: PageInfo };
  pages_get: { params: PagesGetParams; result: PagesGetResult };
  pages_list: { params: Paging; result: PagesListResult };
  pages_versions: { params: PagesVersionsParams; result: PagesVersionsResult };
  pages_set_access: { params: PagesSetAccessParams; result: PageInfo };
  pages_delete: { params: PagesDeleteParams; result: Empty };
}
