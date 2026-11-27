export const PAGE_RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

/** The MCP resource template of the `kind: "html"` versions of every page. */
export const PAGE_RESOURCE_URI_TEMPLATE = "ui://agentpages/{pageId}/{version}";

/** The MCP resource of one `kind: "html"` version. */
export const pageResourceUri = ({ pageId, version }: { pageId: string; version: number }): string =>
  PAGE_RESOURCE_URI_TEMPLATE.replace("{pageId}", pageId).replace("{version}", String(version));

const PAGE_RESOURCE_URI = /^ui:\/\/agentpages\/([^/]+)\/(\d+)$/u;

/** The version a resource URI names: the inverse of `pageResourceUri`. Nothing for any other URI. */
export const pageOfResourceUri = (uri: string): { pageId: string; version: number } | undefined => {
  const [pageId, version] = PAGE_RESOURCE_URI.exec(uri)?.slice(1) ?? [];
  return pageId === undefined ? undefined : { pageId, version: Number(version) };
};

/** The `_meta.ui.visibility` every Store tool declares. */
export const TOOL_VISIBILITY = ["model"] as const;
