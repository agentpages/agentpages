import { type Answer, toToolError } from "@agentpages/protocol";
import type { ToolCall } from "@agentpages/server";
import { type CallToolResult, ProtocolError, ProtocolErrorCode } from "@modelcontextprotocol/server";

/** What MCP makes of the answer of a Store: its result, its failure as a tool error, or the error of an unknown tool. */
export const toolResult = ({ tool }: ToolCall, answer: Answer): CallToolResult => {
  if (answer.kind === "failure") return { ...toToolError(answer.failure) };
  if (answer.kind === "unknown-method") throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Unknown tool: ${tool}`);
  return { structuredContent: answer.result, content: [{ type: "text", text: JSON.stringify(answer.result) }] };
};
