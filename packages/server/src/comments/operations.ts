import { type CommentsTools, HOST_OPERATION_SCHEMAS, type HostOperations, TOOL_SCHEMAS } from "@agentpages/protocol";
import type { Agent, Visitor } from "../access/principal.js";
import { existingPage, linkedPage } from "../pages/target.js";
import type { Handler } from "../pipeline/index.js";
import { commentsReply, commentsResolve } from "./change.js";
import { commentsList } from "./list.js";
import { commentsStart } from "./start.js";

/** Section 5.4 of the spec: the comments tools of an agent, which names its page by `pageId`. */
export const COMMENTS_TOOLS: {
  readonly [T in keyof CommentsTools]: Handler<CommentsTools[T]["params"], CommentsTools[T]["result"], Agent>;
} = {
  comments_list: commentsList({ schemas: TOOL_SCHEMAS.comments_list, page: existingPage }),
  comments_reply: commentsReply({ schemas: TOOL_SCHEMAS.comments_reply, page: existingPage }),
  comments_resolve: commentsResolve({ schemas: TOOL_SCHEMAS.comments_resolve, page: existingPage }),
};

type Comments = Pick<HostOperations, "comments_start" | keyof CommentsTools>;

/** Section 5.6 of the spec: what a host does with comments for a viewer, whose page is the one their `url` names. */
export const COMMENTS_HOST_OPERATIONS: {
  readonly [O in keyof Comments]: Handler<Comments[O]["params"], Comments[O]["result"], Visitor>;
} = {
  comments_start: commentsStart({ schemas: HOST_OPERATION_SCHEMAS.comments_start, page: linkedPage }),
  comments_list: commentsList({ schemas: HOST_OPERATION_SCHEMAS.comments_list, page: linkedPage }),
  comments_reply: commentsReply({ schemas: HOST_OPERATION_SCHEMAS.comments_reply, page: linkedPage }),
  comments_resolve: commentsResolve({ schemas: HOST_OPERATION_SCHEMAS.comments_resolve, page: linkedPage }),
};
