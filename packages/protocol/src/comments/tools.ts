import type { Thread } from "./types.js";

export interface CommentsListParams {
  pageId: string;
  status?: Thread["status"];
  cursor?: string;
  limit?: number;
}

export interface CommentsListResult {
  threads: Thread[];
  nextCursor?: string;
}

export interface CommentsReplyParams {
  opId: string;
  pageId: string;
  threadId: string;
  body: string;
}

export interface CommentsResolveParams {
  opId: string;
  pageId: string;
  threadId: string;
}

export interface CommentsTools {
  comments_list: { params: CommentsListParams; result: CommentsListResult };
  comments_reply: { params: CommentsReplyParams; result: Thread };
  comments_resolve: { params: CommentsResolveParams; result: Thread };
}
