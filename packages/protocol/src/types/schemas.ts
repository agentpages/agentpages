import * as v from "valibot";
import { ID_PATTERN } from "../common/patterns.js";
import {
  BodySchema,
  CountSchema,
  DescriptionSchema,
  type ExchangeSchemas,
  IdSchema,
  JsonObjectSchema,
  NameSchema,
  PagingSchema,
  record,
  type Schema,
  TimestampSchema,
  UuidSchema,
} from "../common/schemas.js";
import { htmlEntries } from "../pages/schemas.js";
import { PDF_FORMAT } from "../render/constants.js";
import type { TypesTools } from "./tools.js";
import type { TypeContent, TypeInfo } from "./types.js";

const describedEntries = {
  typeId: IdSchema,
  title: NameSchema,
  description: DescriptionSchema,
  instructions: BodySchema,
  collections: record(
    IdSchema,
    v.object({ schema: JsonObjectSchema, tree: v.exactOptional(v.literal(true)) }),
  ),
  exports: record(
    v.pipe(v.string(), v.regex(ID_PATTERN), v.notValue(PDF_FORMAT)),
    v.object({ title: NameSchema, mimeType: NameSchema, extension: v.string() }),
  ),
};

export const TypeInfoSchema: Schema<TypeInfo> = v.object({
  ...describedEntries,
  version: CountSchema,
  updatedAt: TimestampSchema,
});

export const TypeContentSchema: Schema<TypeContent> = v.object(htmlEntries);

export const TYPES_TOOL_SCHEMAS: ExchangeSchemas<TypesTools> = {
  types_publish: {
    params: v.object({
      ...describedEntries,
      opId: UuidSchema,
      baseVersion: CountSchema,
      content: TypeContentSchema,
    }),
    result: TypeInfoSchema,
  },
  types_get: {
    params: v.object({ typeId: IdSchema, version: v.exactOptional(CountSchema) }),
    result: v.intersect([TypeInfoSchema, v.object({ content: TypeContentSchema })]),
  },
  types_list: {
    params: PagingSchema,
    result: v.object({ types: v.array(TypeInfoSchema), nextCursor: v.exactOptional(v.string()) }),
  },
};
