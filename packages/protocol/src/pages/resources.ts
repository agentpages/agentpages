export const PAGE_RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

/** The MCP resource of one `kind: "html"` version. */
export const pageResourceUri = ({ pageId, version }: { pageId: string; version: number }): string =>
  `ui://agentpages/${pageId}/${version}`;

/** The `_meta.ui.visibility` every Store tool declares. */
export const TOOL_VISIBILITY = ["model"] as const;
