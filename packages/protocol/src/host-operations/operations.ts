import type { Thread } from "../comments/types.js";
import type { Opened } from "./types.js";

export interface PagesOpenParams {
  url: string;
}

export interface CommentsStartParams {
  opId: string;
  pageId: string;
  quote?: string;
  body: string;
}

/** What a host asks of its Store for a viewer. These are not MCP tools. */
export interface HostOperations {
  pages_open: { params: PagesOpenParams; result: Opened };
  comments_start: { params: CommentsStartParams; result: Thread };
}
