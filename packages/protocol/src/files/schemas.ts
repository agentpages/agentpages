import * as v from "valibot";
import {
  Base64Schema,
  CountSchema,
  EmptySchema,
  IdSchema,
  NameSchema,
  ofPage,
  pagingEntries,
  PagingSchema,
  type Raw,
  TimestampSchema,
  UuidSchema,
} from "../common/schemas.js";
import { exchange } from "../common/seal.js";
import type { ExchangeSchemas } from "../common/validate.js";
import type { ToolsOf } from "../extension/names.js";
import { ActorSchema } from "../state/schemas.js";
import type { FilesMethods } from "./methods.js";
import type { FileInfo } from "./types.js";

type FilesTools = ToolsOf<FilesMethods>;

export const FileInfoSchema: Raw<FileInfo> = v.object({
  id: IdSchema,
  name: NameSchema,
  mimeType: NameSchema,
  size: CountSchema,
  updatedAt: TimestampSchema,
  updatedBy: ActorSchema,
});

const put = { opId: UuidSchema, id: IdSchema, name: NameSchema, mimeType: NameSchema, blob: Base64Schema };
const stored = v.object({ file: FileInfoSchema });
const get = { id: IdSchema };
const got = v.object({ file: FileInfoSchema, blob: Base64Schema });
const listed = v.object({ files: v.array(FileInfoSchema), nextCursor: v.exactOptional(v.string()) });
const remove = { opId: UuidSchema, id: IdSchema };

export const FILES_METHOD_SCHEMAS: ExchangeSchemas<FilesMethods> = {
  "agentpages/files/put": exchange(v.object(put), stored),
  "agentpages/files/get": exchange(v.object(get), got),
  "agentpages/files/list": exchange(PagingSchema, listed),
  "agentpages/files/delete": exchange(v.object(remove), EmptySchema),
};

export const FILES_TOOL_PARAMS: { readonly [T in keyof FilesTools]: Raw<FilesTools[T]["params"]> } = {
  files_put: ofPage(put),
  files_get: ofPage(get),
  files_list: ofPage(pagingEntries),
  files_delete: ofPage(remove),
};

export const FILES_TOOL_SCHEMAS: ExchangeSchemas<FilesTools> = {
  files_put: exchange(FILES_TOOL_PARAMS.files_put, stored),
  files_get: exchange(FILES_TOOL_PARAMS.files_get, got),
  files_list: exchange(FILES_TOOL_PARAMS.files_list, listed),
  files_delete: exchange(FILES_TOOL_PARAMS.files_delete, EmptySchema),
};
