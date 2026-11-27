import type { PageInfo } from "../pages/types.js";
import type { TypeContent, TypeInfo } from "../types/types.js";

/** Where a page stands. A host compares each number with the one it saw last to learn what changed. */
export interface Heads {
  version: number;
  seq: number;
  viewerSeq?: number;
  comments: number;
}

/** What a host needs to show a page: the page, what to render, and the type of a typed page. */
export interface Opened {
  page: PageInfo;
  view: TypeContent;
  type?: TypeInfo;
}
