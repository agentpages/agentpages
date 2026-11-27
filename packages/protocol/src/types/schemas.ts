import * as v from "valibot";
import { ID_PATTERN } from "../common/patterns.js";
import {
  BodySchema,
  CountSchema,
  DescriptionSchema,
  IdSchema,
  JsonObjectSchema,
  mapOf,
  NameSchema,
  PagingSchema,
  type Raw,
  TimestampSchema,
  UuidSchema,
} from "../common/schemas.js";
import { exchange, sealed } from "../common/seal.js";
import type { ExchangeSchemas, Schema } from "../common/validate.js";
import { htmlEntries } from "../pages/schemas.js";
import { PDF_FORMAT } from "../render/constants.js";
import type { TypesTools } from "./tools.js";
import type { TypeContent, TypeInfo } from "./types.js";

const describedEntries = {
  typeId: IdSchema,
  title: NameSchema,
  description: DescriptionSchema,
  instructions: BodySchema,
  collections: mapOf({
    key: IdSchema,
    value: v.object({ schema: JsonObjectSchema, tree: v.exactOptional(v.literal(true)) }),
  }),
  exports: mapOf({
    key: v.pipe(v.string(), v.regex(ID_PATTERN), v.notValue(PDF_FORMAT)),
    value: v.object({ title: NameSchema, mimeType: NameSchema, extension: v.string() }),
  }),
};

const TypeInfoRaw: Raw<TypeInfo> = v.object({ ...describedEntries, version: CountSchema, updatedAt: TimestampSchema });

export const TypeInfoSchema: Schema<TypeInfo> = sealed(TypeInfoRaw);

const TypeContentSchema: Raw<TypeContent> = v.object(htmlEntries);

export const TYPES_TOOL_PARAMS: { readonly [T in keyof TypesTools]: Raw<TypesTools[T]["params"]> } = {
  types_publish: v.object({
    ...describedEntries,
    opId: UuidSchema,
    baseVersion: CountSchema,
    content: TypeContentSchema,
  }),
  types_get: v.object({ typeId: IdSchema, version: v.exactOptional(CountSchema) }),
  types_list: PagingSchema,
};

export const TYPES_TOOL_SCHEMAS: ExchangeSchemas<TypesTools> = {
  types_publish: exchange(TYPES_TOOL_PARAMS.types_publish, TypeInfoRaw),
  types_get: exchange(
    TYPES_TOOL_PARAMS.types_get,
    v.intersect([TypeInfoRaw, v.object({ content: TypeContentSchema })]),
  ),
  types_list: exchange(
    TYPES_TOOL_PARAMS.types_list,
    v.object({ types: v.array(TypeInfoRaw), nextCursor: v.exactOptional(v.string()) }),
  ),
};
