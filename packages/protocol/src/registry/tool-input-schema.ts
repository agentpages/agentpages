import { toJsonSchema } from "@valibot/to-json-schema";
import { COMMENTS_TOOL_PARAMS } from "../comments/schemas.js";
import type { Raw } from "../common/schemas.js";
import type { JsonObject } from "../common/types.js";
import { FILES_TOOL_PARAMS } from "../files/schemas.js";
import { PAGES_TOOL_PARAMS } from "../pages/schemas.js";
import { RENDER_TOOL_PARAMS } from "../render/schemas.js";
import { STATE_TOOL_PARAMS } from "../state/schemas.js";
import { TYPES_TOOL_PARAMS } from "../types/schemas.js";
import type { ToolName, Tools } from "./tools.js";

const TOOL_PARAMS: { readonly [T in ToolName]: Raw<Tools[T]["params"]> } = {
  ...STATE_TOOL_PARAMS,
  ...FILES_TOOL_PARAMS,
  ...PAGES_TOOL_PARAMS,
  ...COMMENTS_TOOL_PARAMS,
  ...RENDER_TOOL_PARAMS,
  ...TYPES_TOOL_PARAMS,
};

/** What JSON Schema says of the checks it cannot make itself: an object, or a text that holds base64. */
const STANDS_FOR: Record<string, JsonObject> = { raw_transform: { type: "object" }, raw_check: { type: "string", contentEncoding: "base64" } };

/** A JSON Schema of one object, as MCP asks of the `inputSchema` of a tool. */
export interface ToolInputSchema extends JsonObject {
  type: "object";
}

/**
 * The `inputSchema` of a tool, as JSON Schema 2020-12: one object, with no `allOf`. It accepts every valid input. JSON objects the protocol does
 * not interpret, and maps keyed by id, are plain objects in it, and a `blob` is a string that says it holds base64:
 * their content is checked by `TOOL_SCHEMAS` alone.
 */
export const toolInputSchema = (tool: ToolName): ToolInputSchema => ({
  ...toJsonSchema(TOOL_PARAMS[tool], {
    target: "draft-2020-12",
    errorMode: "ignore",
    overrideAction: ({ valibotAction }) => STANDS_FOR[valibotAction.type],
  }),
  type: "object",
});
