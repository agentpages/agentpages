import type { JsonObject } from "../common/types.js";
import type { McpUiCsp, McpUiPermissions } from "../pages/types.js";

/** A JSON Schema (2020-12). */
export type JsonSchema = JsonObject;

export interface TypeInfo {
  typeId: string;
  version: number;
  title: string;
  description: string;
  instructions: string;
  collections: Record<string, { schema: JsonSchema; tree?: true }>;
  exports: Record<string, { title: string; mimeType: string; extension: string }>;
  updatedAt: string;
}

export interface TypeContent {
  html: string;
  csp?: McpUiCsp;
  permissions?: McpUiPermissions;
}
