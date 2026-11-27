import type { Paging } from "../common/types.js";
import type { TypeContent, TypeInfo } from "./types.js";

export interface TypesPublishParams {
  opId: string;
  typeId: string;
  baseVersion: number;
  title: string;
  description: string;
  instructions: string;
  collections: TypeInfo["collections"];
  exports: TypeInfo["exports"];
  content: TypeContent;
}

export interface TypesGetParams {
  typeId: string;
  version?: number;
}

export type TypesGetResult = TypeInfo & { content: TypeContent };

export interface TypesListResult {
  types: TypeInfo[];
  nextCursor?: string;
}

export interface TypesTools {
  types_publish: { params: TypesPublishParams; result: TypeInfo };
  types_get: { params: TypesGetParams; result: TypesGetResult };
  types_list: { params: Paging; result: TypesListResult };
}
