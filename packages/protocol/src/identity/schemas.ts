import * as v from "valibot";
import { EmptySchema, IdSchema, NameSchema, type Raw } from "../common/schemas.js";
import { exchange } from "../common/seal.js";
import type { ExchangeSchemas } from "../common/validate.js";
import type { IdentityMethods } from "./methods.js";
import type { Viewer } from "./types.js";

export const ViewerSchema: Raw<Viewer> = v.object({ id: IdSchema, name: v.exactOptional(NameSchema) });

export const IDENTITY_METHOD_SCHEMAS: ExchangeSchemas<IdentityMethods> = {
  "agentpages/identity/get": exchange(EmptySchema, v.object({ viewer: v.nullable(ViewerSchema) })),
};
