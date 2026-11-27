import * as v from "valibot";
import {
  BodySchema,
  CountSchema,
  DescriptionSchema,
  type ExchangeSchemas,
  IdSchema,
  PagingSchema,
  type Schema,
  TimestampSchema,
  UuidSchema,
} from "../common/schemas.js";
import { ViewerSchema } from "../identity/schemas.js";
import type { CommentsResolveParams, CommentsTools } from "./tools.js";
import type { Entry, Thread } from "./types.js";

const StatusSchema: Schema<Thread["status"]> = v.picklist(["open", "resolved"]);

export const EntrySchema: Schema<Entry> = v.object({
  id: IdSchema,
  author: v.nullable(ViewerSchema),
  body: BodySchema,
  createdAt: TimestampSchema,
});

export const ThreadSchema: Schema<Thread> = v.object({
  id: IdSchema,
  pageId: UuidSchema,
  version: CountSchema,
  quote: v.exactOptional(DescriptionSchema),
  status: StatusSchema,
  entries: v.array(EntrySchema),
});

const ThreadOpSchema: Schema<CommentsResolveParams> = v.object({
  opId: UuidSchema,
  pageId: UuidSchema,
  threadId: IdSchema,
});

export const COMMENTS_TOOL_SCHEMAS: ExchangeSchemas<CommentsTools> = {
  comments_list: {
    params: v.intersect([
      v.object({ pageId: UuidSchema, status: v.exactOptional(StatusSchema) }),
      PagingSchema,
    ]),
    result: v.object({ threads: v.array(ThreadSchema), nextCursor: v.exactOptional(v.string()) }),
  },
  comments_reply: {
    params: v.intersect([ThreadOpSchema, v.object({ body: BodySchema })]),
    result: ThreadSchema,
  },
  comments_resolve: { params: ThreadOpSchema, result: ThreadSchema },
};
