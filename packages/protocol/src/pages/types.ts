import type { JsonObject } from "../common/types.js";

/** The MCP Apps `_meta.ui.csp` object. */
export type McpUiCsp = JsonObject;

/** The MCP Apps `_meta.ui.permissions` object. */
export type McpUiPermissions = JsonObject;

export interface PageInfo {
  pageId: string;
  title: string;
  description?: string;
  version: number;
  access: "private" | "link-read" | "link-write";
  url: string;
  updatedAt: string;
}

export type PageContent =
  | { kind: "html"; html: string; csp?: McpUiCsp; permissions?: McpUiPermissions }
  | { kind: "type"; typeId: string; typeVersion: number };
