import { type Capability, EXTENSION_ID } from "@agentpages/protocol";
import type { Agent, Store, ToolCall } from "@agentpages/server";
import { McpServer } from "@modelcontextprotocol/server";
import { readResource, RESOURCE_TEMPLATES } from "./resources/read.js";
import { asked } from "./store/ask.js";
import { toolResult } from "./tools/call.js";
import { listTools } from "./tools/list.js";

const SERVER_NAME = "agentpages";

/** `T` as the JSON object it is on the wire. */
type Json<T> = T extends object ? { [K in keyof T]: Json<T[K]> } : T;

const answered = async (store: Store, call: ToolCall): Promise<ReturnType<typeof toolResult>> =>
  toolResult(call, await asked(store, call));

/**
 * The MCP server of a Store, for one agent: its tools, the resources of its `kind: "html"` versions, and its
 * capability under the extension identifier. It has no transport: connect what it returns to one, once for each
 * connection or request.
 */
export const createAgentServer =
  (store: Store) =>
  (principal: Agent): McpServer => {
    const advertised: Json<Capability> = store.capability;
    const mcp = new McpServer(
      { name: SERVER_NAME, version: store.capability.version },
      { capabilities: { tools: { listChanged: false }, resources: { listChanged: false }, extensions: { [EXTENSION_ID]: advertised } } },
    );
    const { server } = mcp;
    server.setRequestHandler("tools/list", () => listTools(store));
    server.setRequestHandler("tools/call", ({ params }) =>
      answered(store, { tool: params.name, input: params.arguments, principal }),
    );
    server.setRequestHandler("resources/list", () => ({ resources: [] }));
    server.setRequestHandler("resources/templates/list", () => RESOURCE_TEMPLATES);
    server.setRequestHandler("resources/read", ({ params }) => readResource(store, { uri: params.uri, principal }));
    return mcp;
  };
