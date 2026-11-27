# @agentpages/mcp

The MCP server of a Store of the [agentpages protocol](../../spec/agentpages.md). It has no transport and no login: a deployment binds it to one and tells it who the agent is.

## Create a server

```ts
import { createAgentServer } from "@agentpages/mcp";
import { createMcpHandler } from "@modelcontextprotocol/server";

const serverFor = createAgentServer(store);

const handler = createMcpHandler(() => serverFor({ kind: "agent", subject }));
```

`createAgentServer(store)` returns a factory. Call it with the agent a connection or a request belongs to, and connect the `McpServer` it returns. It is built on the official TypeScript SDK, `@modelcontextprotocol/server`, which serves MCP 2026-07-28 and the `initialize` handshake of earlier clients.

## What it serves

| Request | Answer |
|---|---|
| discovery | `capabilities.extensions["io.github.agentpages/agentpages"]` is `store.capability` |
| `tools/list` | Every tool of `store.tools`, with its description and `inputSchema` from `@agentpages/protocol`, `_meta.ui.visibility: ["model"]` and no `outputSchema` |
| `tools/call` | `store.call` as the agent. A result is `structuredContent` and the same JSON as one text block. A failure is a tool error with `isError: true`. A tool the Store does not have is the JSON-RPC error `-32602`, as MCP asks for an unknown tool |
| `resources/templates/list` | `ui://agentpages/{pageId}/{version}` |
| `resources/read` | The `html` of that version with its `csp` and `permissions` under `_meta.ui`, as `pages_get` returns it to the agent. A URI that names no version, a page the agent cannot read and a version that is not html are the JSON-RPC error `-32602`, resource not found |
| `resources/list` | Nothing: a version is read by its URI |

Nothing about a tool is declared here. A call the agent cancels still completes in the Store, and a repeat with the same `opId` gets its result.

A deployment refuses a request body larger than `store.capability.limits.maxRequestBytes` before it reaches this server. A failure of the Store other than a missing or forbidden page reaches a reader of a resource as its JSON-RPC error, and a Store that throws as `-32603` with no detail.
