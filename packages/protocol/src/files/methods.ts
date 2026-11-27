import type { Empty, Paging } from "../common/types.js";
import type { FileInfo } from "./types.js";

export interface FilesPutParams {
  opId: string;
  id: string;
  name: string;
  mimeType: string;
  blob: string;
}

export interface FilesPutResult {
  file: FileInfo;
}

export interface FilesGetParams {
  id: string;
}

export interface FilesGetResult {
  file: FileInfo;
  blob: string;
}

export interface FilesListResult {
  files: FileInfo[];
  nextCursor?: string;
}

export interface FilesDeleteParams {
  opId: string;
  id: string;
}

export interface FilesMethods {
  "agentpages/files/put": { params: FilesPutParams; result: FilesPutResult };
  "agentpages/files/get": { params: FilesGetParams; result: FilesGetResult };
  "agentpages/files/list": { params: Paging; result: FilesListResult };
  "agentpages/files/delete": { params: FilesDeleteParams; result: Empty };
}
