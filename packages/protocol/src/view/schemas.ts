import * as v from "valibot";
import { Base64Schema, EmptySchema, IdSchema } from "../common/schemas.js";
import { exchange } from "../common/seal.js";
import type { ExchangeSchemas } from "../common/validate.js";
import type { ViewMethods } from "./methods.js";

export const VIEW_METHOD_SCHEMAS: ExchangeSchemas<ViewMethods> = {
  "agentpages/view/reveal": exchange(v.object({ collection: IdSchema, id: IdSchema }), EmptySchema),
  "agentpages/view/export": exchange(v.object({ format: IdSchema }), v.object({ blob: Base64Schema })),
};
