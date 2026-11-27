import { UUID_PATTERN } from "../common/patterns.js";

export const PAGE_RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

export interface PageVersion {
  pageId: string;
  version: number;
}

/** The MCP resource template of the `kind: "html"` versions of every page. */
export const PAGE_RESOURCE_URI_TEMPLATE = "ui://agentpages/{pageId}/{version}";

/** The MCP resource of one `kind: "html"` version. */
export const pageResourceUri = ({ pageId, version }: PageVersion): string =>
  PAGE_RESOURCE_URI_TEMPLATE.replace("{pageId}", pageId).replace("{version}", String(version));

const isVersion = ({ pageId, version }: PageVersion): boolean =>
  UUID_PATTERN.test(pageId) && Number.isSafeInteger(version) && version >= 0;

/**
 * The version a resource URI names: the inverse of `pageResourceUri`. A URI names a version only when it is exactly
 * what `pageResourceUri` makes of one.
 */
export const pageOfResourceUri = (uri: string): PageVersion | undefined => {
  const [pageId, version] = uri.split("/").slice(3);
  const named = { pageId: String(pageId), version: Number(version) };
  return isVersion(named) && pageResourceUri(named) === uri ? named : undefined;
};

/** The `_meta.ui.visibility` every Store tool declares. */
export const TOOL_VISIBILITY = ["model"] as const;
