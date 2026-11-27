import * as v from "valibot";
import {
  CountSchema,
  DescriptionSchema,
  EmptySchema,
  type ExchangeSchemas,
  IdSchema,
  JsonObjectSchema,
  NameSchema,
  type Optional,
  PagingSchema,
  type Schema,
  TimestampSchema,
  UuidSchema,
} from "../common/schemas.js";
import type { JsonObject } from "../common/types.js";
import type { PagesTools } from "./tools.js";
import type { PageContent, PageInfo } from "./types.js";

const AccessSchema: Schema<PageInfo["access"]> = v.picklist(["private", "link-read", "link-write"]);

export const PageInfoSchema: Schema<PageInfo> = v.object({
  pageId: UuidSchema,
  title: NameSchema,
  description: v.exactOptional(DescriptionSchema),
  version: CountSchema,
  access: AccessSchema,
  url: v.string(),
  updatedAt: TimestampSchema,
});

export const htmlEntries: { html: Schema<string>; csp: Optional<JsonObject>; permissions: Optional<JsonObject> } = {
  html: v.string(),
  csp: v.exactOptional(JsonObjectSchema),
  permissions: v.exactOptional(JsonObjectSchema),
};

export const PageContentSchema: Schema<PageContent> = v.variant("kind", [
  v.object({ kind: v.literal("html"), ...htmlEntries }),
  v.object({ kind: v.literal("type"), typeId: IdSchema, typeVersion: CountSchema }),
]);

const PageIdSchema: Schema<{ pageId: string }> = v.object({ pageId: UuidSchema });

const PageOpSchema: Schema<{ opId: string; pageId: string }> = v.object({ opId: UuidSchema, pageId: UuidSchema });

export const PAGES_TOOL_SCHEMAS: ExchangeSchemas<PagesTools> = {
  pages_publish: {
    params: v.intersect([
      PageOpSchema,
      v.object({
        baseVersion: CountSchema,
        title: NameSchema,
        description: v.exactOptional(DescriptionSchema),
        content: PageContentSchema,
      }),
    ]),
    result: PageInfoSchema,
  },
  pages_get: {
    params: v.object({ pageId: UuidSchema, version: v.exactOptional(CountSchema) }),
    result: v.intersect([PageInfoSchema, v.object({ content: PageContentSchema })]),
  },
  pages_list: {
    params: PagingSchema,
    result: v.object({ pages: v.array(PageInfoSchema), nextCursor: v.exactOptional(v.string()) }),
  },
  pages_versions: {
    params: v.intersect([PageIdSchema, PagingSchema]),
    result: v.object({
      versions: v.array(v.object({ version: CountSchema, createdAt: TimestampSchema })),
      nextCursor: v.exactOptional(v.string()),
    }),
  },
  pages_set_access: {
    params: v.intersect([PageOpSchema, v.object({ access: AccessSchema })]),
    result: PageInfoSchema,
  },
  pages_delete: { params: PageOpSchema, result: EmptySchema },
};
