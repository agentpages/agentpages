import type { FileInfo } from "../files/types.js";
import type { RenderInput, RenderResult } from "./types.js";

export interface PagesExportParams {
  opId: string;
  pageId: string;
  version?: number;
  fileId: string;
  name: string;
  format: string;
}

export type PagesExportResult = Omit<RenderResult, "image"> & { file: FileInfo };

export interface RenderTools {
  pages_render: { params: RenderInput; result: RenderResult };
  pages_export: { params: PagesExportParams; result: PagesExportResult };
}
