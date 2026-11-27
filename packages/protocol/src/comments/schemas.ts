import * as v from "valibot";
import { exchange } from "../common/seal.js";
import type { ExchangeSchemas } from "../common/validate.js";
import {
  BodySchema,
  CountSchema,
  DescriptionSchema,
  IdSchema,
  ofPage,
  type Optional,
  pagingEntries,
  type Raw,
  TimestampSchema,
  UuidSchema,
} from "../common/schemas.js";
import { ViewerSchema } from "../identity/schemas.js";
import type { CommentsListResult, CommentsTools } from "./tools.js";
import type { Thread } from "./types.js";

const StatusSchema: Raw<Thread["status"]> = v.picklist(["open", "resolved"]);

export const ThreadSchema: Raw<Thread> = v.object({
  id: IdSchema,
  pageId: UuidSchema,
  version: CountSchema,
  quote: v.exactOptional(DescriptionSchema),
  status: StatusSchema,
  entries: v.pipe(
    v.array(
      v.object({ id: IdSchema, author: v.nullable(ViewerSchema), body: BodySchema, createdAt: TimestampSchema }),
    ),
    v.minLength(1),
  ),
});

interface CommentsEntries {
  readonly comments_list: { status: Optional<Thread["status"]> } & typeof pagingEntries;
  readonly comments_reply: { opId: Raw<string>; threadId: Raw<string>; body: Raw<string> };
  readonly comments_resolve: { opId: Raw<string>; threadId: Raw<string> };
}

/** The entries of the params of each comments tool, without the page they name. */
export const COMMENTS_ENTRIES: CommentsEntries = {
  comments_list: { status: v.exactOptional(StatusSchema), ...pagingEntries },
  comments_reply: { opId: UuidSchema, threadId: IdSchema, body: BodySchema },
  comments_resolve: { opId: UuidSchema, threadId: IdSchema },
};

export const ThreadsSchema: Raw<CommentsListResult> = v.object({
  threads: v.array(ThreadSchema),
  nextCursor: v.exactOptional(v.string()),
});

export const COMMENTS_TOOL_PARAMS: { readonly [T in keyof CommentsTools]: Raw<CommentsTools[T]["params"]> } = {
  comments_list: ofPage(COMMENTS_ENTRIES.comments_list),
  comments_reply: ofPage(COMMENTS_ENTRIES.comments_reply),
  comments_resolve: ofPage(COMMENTS_ENTRIES.comments_resolve),
};

export const COMMENTS_TOOL_SCHEMAS: ExchangeSchemas<CommentsTools> = {
  comments_list: exchange(COMMENTS_TOOL_PARAMS.comments_list, ThreadsSchema),
  comments_reply: exchange(COMMENTS_TOOL_PARAMS.comments_reply, ThreadSchema),
  comments_resolve: exchange(COMMENTS_TOOL_PARAMS.comments_resolve, ThreadSchema),
};
