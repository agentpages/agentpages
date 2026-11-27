import {
  type Failure,
  PAGE_RESOURCE_MIME_TYPE,
  PAGE_RESOURCE_URI_TEMPLATE,
  pageOfResourceUri,
  TOOL_SCHEMAS,
  toJsonRpcError,
  validate,
} from "@agentpages/protocol";
import type { Agent, Store } from "@agentpages/server";
import {
  type ListResourceTemplatesResult,
  ProtocolError,
  type ReadResourceResult,
  ResourceNotFoundError,
} from "@modelcontextprotocol/server";
import { asked } from "../store/ask.js";

/** The one template of a Store: every `kind: "html"` version of a page. */
export const RESOURCE_TEMPLATES: ListResourceTemplatesResult = {
  resourceTemplates: [
    { name: "page", uriTemplate: PAGE_RESOURCE_URI_TEMPLATE, mimeType: PAGE_RESOURCE_MIME_TYPE }],
};

export interface ResourceRead {
  uri: string;
  principal: Agent;
}

const NO_RESOURCE: ReadonlySet<string> = new Set(["NotFound", "Forbidden"]);

/** A failure of the Store that does not say the resource is missing, as the JSON-RPC error of the protocol. */
const refusal = (failed: Failure): ProtocolError => {
  const { code, message, data } = toJsonRpcError(failed);
  return new ProtocolError(code, message, data);
};

/**
 * The `kind: "html"` version a resource URI names, as `pages_get` returns it to the agent. A URI that names no
 * version, a version the agent cannot read and one that is not html are not found. Any other failure is its error.
 */
export const readResource = async (store: Store, { uri, principal }: ResourceRead): Promise<ReadResourceResult> => {
  const named = pageOfResourceUri(uri);
  if (named === undefined) throw new ResourceNotFoundError(uri);
  const answer = await asked(store, { tool: "pages_get", input: named, principal });
  if (answer.kind === "failure" && !NO_RESOURCE.has(answer.failure.error)) throw refusal(answer.failure);
  const { result }: { kind: string; result?: unknown } = answer;
  const page = validate(TOOL_SCHEMAS.pages_get.result, result);
  if (!page.ok || page.value.content.kind !== "html") throw new ResourceNotFoundError(uri);
  const { html, csp, permissions } = page.value.content;
  return { contents: [{ uri, mimeType: PAGE_RESOURCE_MIME_TYPE, text: html, _meta: { ui: { csp, permissions } } }] };
};
