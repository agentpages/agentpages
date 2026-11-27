---
"@agentpages/mcp": minor
"@agentpages/protocol": minor
"@agentpages/server": minor
---

Add `createAgentServer(store)` to `@agentpages/mcp`: the MCP server of a Store for one agent, on the official TypeScript SDK, with its tools, the resources of its html versions and its capability under the extension identifier. `@agentpages/protocol` gains `TOOL_DESCRIPTIONS`, the limit `maxRequestBytes`, `pageOfResourceUri`, `PAGE_RESOURCE_URI_TEMPLATE` and `isToolName`, and `toolInputSchema` now returns one object schema for every tool, with no `allOf`, as MCP requires. `Store.tools` is typed as `readonly ToolName[]`. A Store takes no `render` in its capability until it renders, and refuses a `maxRequestBytes` below its html or file limit.
