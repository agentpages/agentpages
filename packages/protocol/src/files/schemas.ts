import * as v from "valibot";
import {
  Base64Schema,
  CountSchema,
  EmptySchema,
  type ExchangeSchemas,
  IdSchema,
  NameSchema,
  PagingSchema,
  type Schema,
  TimestampSchema,
  UuidSchema,
} from "../common/schemas.js";
import { ActorSchema } from "../state/schemas.js";
import type { FilesMethods } from "./methods.js";
import type { FileInfo } from "./types.js";

export const FileInfoSchema: Schema<FileInfo> = v.object({
  id: IdSchema,
  name: NameSchema,
  mimeType: NameSchema,
  size: CountSchema,
  updatedAt: TimestampSchema,
  updatedBy: ActorSchema,
});

export const FILES_METHOD_SCHEMAS: ExchangeSchemas<FilesMethods> = {
  "agentpages/files/put": {
    params: v.object({
      opId: UuidSchema,
      id: IdSchema,
      name: NameSchema,
      mimeType: NameSchema,
      blob: Base64Schema,
    }),
    result: v.object({ file: FileInfoSchema }),
  },
  "agentpages/files/get": {
    params: v.object({ id: IdSchema }),
    result: v.object({ file: FileInfoSchema, blob: Base64Schema }),
  },
  "agentpages/files/list": {
    params: PagingSchema,
    result: v.object({ files: v.array(FileInfoSchema), nextCursor: v.exactOptional(v.string()) }),
  },
  "agentpages/files/delete": {
    params: v.object({ opId: UuidSchema, id: IdSchema }),
    result: EmptySchema,
  },
};
