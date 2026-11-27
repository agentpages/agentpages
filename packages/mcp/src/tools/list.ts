import { TOOL_DESCRIPTIONS, TOOL_VISIBILITY, type ToolName, toolInputSchema } from "@agentpages/protocol";
import type { Store } from "@agentpages/server";
import type { ListToolsResult, Tool } from "@modelcontextprotocol/server";

const listed = (name: ToolName): Tool => ({
  name,
  description: TOOL_DESCRIPTIONS[name],
  inputSchema: toolInputSchema(name),
  _meta: { ui: { visibility: TOOL_VISIBILITY } },
});

/** The tools of a Store as `tools/list` returns them. */
export const listTools = (store: Store): ListToolsResult => ({ tools: store.tools.map(listed) });
