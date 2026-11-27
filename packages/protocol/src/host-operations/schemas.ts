import * as v from "valibot";
import { ThreadSchema } from "../comments/schemas.js";
import { BodySchema, DescriptionSchema, UuidSchema } from "../common/schemas.js";
import { exchange } from "../common/seal.js";
import type { ExchangeSchemas } from "../common/validate.js";
import { PageInfoSchema } from "../pages/schemas.js";
import { TypeContentSchema, TypeInfoRaw } from "../types/schemas.js";
import type { HostOperations } from "./operations.js";

export const HOST_OPERATION_SCHEMAS: ExchangeSchemas<HostOperations> = {
  pages_open: exchange(
    v.object({ url: v.string() }),
    v.object({ page: PageInfoSchema, view: TypeContentSchema, type: v.exactOptional(TypeInfoRaw) }),
  ),
  comments_start: exchange(
    v.object({ opId: UuidSchema, pageId: UuidSchema, quote: v.exactOptional(DescriptionSchema), body: BodySchema }),
    ThreadSchema,
  ),
};
