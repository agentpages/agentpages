import type { Answer } from "@agentpages/protocol";
import type { Store, ToolCall } from "@agentpages/server";
import { ProtocolError, ProtocolErrorCode } from "@modelcontextprotocol/server";

/** What a Store answers to a tool call. A Store that throws is an internal error that says nothing of what it threw. */
export const asked = async (store: Store, call: ToolCall): Promise<Answer> => {
  try {
    return await store.call(call);
  } catch {
    throw new ProtocolError(ProtocolErrorCode.InternalError, "Internal error");
  }
};
