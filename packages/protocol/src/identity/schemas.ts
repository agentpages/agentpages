import * as v from "valibot";
import { EmptySchema, type ExchangeSchemas, IdSchema, NameSchema, type Schema } from "../common/schemas.js";
import type { IdentityMethods } from "./methods.js";
import type { Viewer } from "./types.js";

export const ViewerSchema: Schema<Viewer> = v.object({ id: IdSchema, name: v.exactOptional(NameSchema) });

export const IDENTITY_METHOD_SCHEMAS: ExchangeSchemas<IdentityMethods> = {
  "agentpages/identity/get": {
    params: EmptySchema,
    result: v.object({ viewer: v.nullable(ViewerSchema) }),
  },
};
