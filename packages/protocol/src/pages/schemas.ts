import * as v from "valibot";
import {
  CountSchema,
  DescriptionSchema,
  EmptySchema,
  IdSchema,
  JsonObjectSchema,
  NameSchema,
  type Optional,
  pagingEntries,
  PagingSchema,
  type Raw,
  TimestampSchema,
  UuidSchema,
} from "../common/schemas.js";
import { exchange } from "../common/seal.js";
import type { JsonObject } from "../common/types.js";
import type { ExchangeSchemas } from "../common/validate.js";
import type { PagesTools } from "./tools.js";
import type { PageContent, PageInfo } from "./types.js";

const AccessSchema: Raw<PageInfo["access"]> = v.picklist(["private", "link-read", "link-write"]);

export const PageInfoSchema: Raw<PageInfo> = v.object({
  pageId: UuidSchema,
  title: NameSchema,
  description: v.exactOptional(DescriptionSchema),
  version: CountSchema,
  access: AccessSchema,
  url: v.string(),
  updatedAt: TimestampSchema,
});

export const htmlEntries: { html: Raw<string>; csp: Optional<JsonObject>; permissions: Optional<JsonObject> } = {
  html: v.string(),
  csp: v.exactOptional(JsonObjectSchema),
  permissions: v.exactOptional(JsonObjectSchema),
};

const PageContentSchema: Raw<PageContent> = v.variant("kind", [
  v.object({ kind: v.literal("html"), ...htmlEntries }),
  v.object({ kind: v.literal("type"), typeId: IdSchema, typeVersion: CountSchema }),
]);

const pageOp = { opId: UuidSchema, pageId: UuidSchema };

export const PAGES_TOOL_PARAMS: { readonly [T in keyof PagesTools]: Raw<PagesTools[T]["params"]> } = {
  pages_publish: v.object({
    ...pageOp,
    baseVersion: CountSchema,
    title: NameSchema,
    description: v.exactOptional(DescriptionSchema),
    content: PageContentSchema,
  }),
  pages_get: v.object({ pageId: UuidSchema, version: v.exactOptional(CountSchema) }),
  pages_list: PagingSchema,
  pages_versions: v.object({ pageId: UuidSchema, ...pagingEntries }),
  pages_set_access: v.object({ ...pageOp, access: AccessSchema }),
  pages_delete: v.object(pageOp),
};

const versions = v.object({
  versions: v.array(v.object({ version: CountSchema, createdAt: TimestampSchema })),
  nextCursor: v.exactOptional(v.string()),
});

export const PAGES_TOOL_SCHEMAS: ExchangeSchemas<PagesTools> = {
  pages_publish: exchange(PAGES_TOOL_PARAMS.pages_publish, PageInfoSchema),
  pages_get: exchange(
    PAGES_TOOL_PARAMS.pages_get,
    v.intersect([PageInfoSchema, v.object({ content: PageContentSchema })]),
  ),
  pages_list: exchange(
    PAGES_TOOL_PARAMS.pages_list,
    v.object({ pages: v.array(PageInfoSchema), nextCursor: v.exactOptional(v.string()) }),
  ),
  pages_versions: exchange(PAGES_TOOL_PARAMS.pages_versions, versions),
  pages_set_access: exchange(PAGES_TOOL_PARAMS.pages_set_access, PageInfoSchema),
  pages_delete: exchange(PAGES_TOOL_PARAMS.pages_delete, EmptySchema),
};
