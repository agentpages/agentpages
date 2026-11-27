import { COMMENTS_TOOL_SCHEMAS } from "../comments/schemas.js";
import type { ExchangeSchemas } from "../common/validate.js";
import { FILES_TOOL_SCHEMAS } from "../files/schemas.js";
import { PAGES_TOOL_SCHEMAS } from "../pages/schemas.js";
import { RENDER_TOOL_SCHEMAS } from "../render/schemas.js";
import { STATE_TOOL_SCHEMAS } from "../state/schemas.js";
import { TYPES_TOOL_SCHEMAS } from "../types/schemas.js";
import type { Tools } from "./tools.js";

export const TOOL_SCHEMAS: ExchangeSchemas<Tools> = {
  ...STATE_TOOL_SCHEMAS,
  ...FILES_TOOL_SCHEMAS,
  ...PAGES_TOOL_SCHEMAS,
  ...COMMENTS_TOOL_SCHEMAS,
  ...RENDER_TOOL_SCHEMAS,
  ...TYPES_TOOL_SCHEMAS,
};
