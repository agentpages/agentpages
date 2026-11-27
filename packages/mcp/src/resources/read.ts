import {
  PAGE_RESOURCE_MIME_TYPE,
  PAGE_RESOURCE_URI_TEMPLATE,
  pageOfResourceUri,
  TOOL_SCHEMAS,
  validate,
} from "@agentpages/protocol";
import type { Agent, Store } from "@agentpages/server";
import {
  type ListResourceTemplatesResult,
  type ReadResourceResult,
  ResourceNotFoundError,
} from "@modelcontextprotocol/server";

/** The one template of a Store: every `kind: "html"` version of a page. */
export const RESOURCE_TEMPLATES: ListResourceTemplatesResult = {
  resourceTemplates: [
    { name: "page", uriTemplate: PAGE_RESOURCE_URI_TEMPLATE, mimeType: PAGE_RESOURCE_MIME_TYPE }],
};

export interface ResourceRead {
  uri: string;
  principal: Agent;
}

/** The `kind: "html"` version a resource URI names, as `pages_get` returns it to the agent. Anything else is not found. */
export const readResource = async (store: Store, { uri, principal }: ResourceRead): Promise<ReadResourceResult> => {
  const { result }: { kind: string; result?: unknown } = await store.call({ tool: "pages_get", input: pageOfResourceUri(uri), principal });
  const page = validate(TOOL_SCHEMAS.pages_get.result, result);
  if (!page.ok || page.value.content.kind !== "html") throw new ResourceNotFoundError(uri);
  const { html, csp, permissions } = page.value.content;
  return { contents: [{ uri, mimeType: PAGE_RESOURCE_MIME_TYPE, text: html, _meta: { ui: { csp, permissions } } }] };
};
