import * as v from "valibot";
import { Base64Schema, EmptySchema, type ExchangeSchemas, IdSchema } from "../common/schemas.js";
import type { ViewMethods } from "./methods.js";

export const VIEW_METHOD_SCHEMAS: ExchangeSchemas<ViewMethods> = {
  "agentpages/view/reveal": {
    params: v.object({ collection: IdSchema, id: IdSchema }),
    result: EmptySchema,
  },
  "agentpages/view/export": {
    params: v.object({ format: v.string() }),
    result: v.object({ blob: Base64Schema }),
  },
};
