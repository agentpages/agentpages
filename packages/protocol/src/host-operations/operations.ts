import type { CommentsTools } from "../comments/tools.js";
import type { Thread } from "../comments/types.js";
import type { Heads, Opened } from "./types.js";

/** The `url` a viewer presented. */
export interface Presented {
  url: string;
}

export interface CommentsStartParams extends Presented {
  opId: string;
  quote?: string;
  body: string;
}

/** A comments tool as a host runs it for a viewer: the presented `url` in place of `pageId`. */
export interface ForViewer<T extends keyof CommentsTools> {
  params: Omit<CommentsTools[T]["params"], "pageId"> & Presented;
  result: CommentsTools[T]["result"];
}

/** What a host asks of its Store for a viewer. These are not MCP tools. */
export interface HostOperations {
  pages_open: { params: Presented; result: Opened };
  comments_start: { params: CommentsStartParams; result: Thread };
  pages_heads: { params: Presented; result: Heads };
  comments_list: ForViewer<"comments_list">;
  comments_reply: ForViewer<"comments_reply">;
  comments_resolve: ForViewer<"comments_resolve">;
}
