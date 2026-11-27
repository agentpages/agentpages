import * as v from "valibot";
import { exchange } from "../common/seal.js";
import type { ExchangeSchemas } from "../common/validate.js";
import {
  BodySchema,
  CountSchema,
  DescriptionSchema,
  IdSchema,
  PagingSchema,
  type Raw,
  TimestampSchema,
  UuidSchema,
} from "../common/schemas.js";
import { ViewerSchema } from "../identity/schemas.js";
import type { CommentsResolveParams, CommentsTools } from "./tools.js";
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

const ThreadOpSchema: Raw<CommentsResolveParams> = v.object({
  opId: UuidSchema,
  pageId: UuidSchema,
  threadId: IdSchema,
});

export const COMMENTS_TOOL_PARAMS: { readonly [T in keyof CommentsTools]: Raw<CommentsTools[T]["params"]> } = {
  comments_list: v.intersect([
    v.object({ pageId: UuidSchema, status: v.exactOptional(StatusSchema) }),
    PagingSchema,
  ]),
  comments_reply: v.intersect([ThreadOpSchema, v.object({ body: BodySchema })]),
  comments_resolve: ThreadOpSchema,
};

export const COMMENTS_TOOL_SCHEMAS: ExchangeSchemas<CommentsTools> = {
  comments_list: exchange(
    COMMENTS_TOOL_PARAMS.comments_list,
    v.object({ threads: v.array(ThreadSchema), nextCursor: v.exactOptional(v.string()) }),
  ),
  comments_reply: exchange(COMMENTS_TOOL_PARAMS.comments_reply, ThreadSchema),
  comments_resolve: exchange(COMMENTS_TOOL_PARAMS.comments_resolve, ThreadSchema),
};
