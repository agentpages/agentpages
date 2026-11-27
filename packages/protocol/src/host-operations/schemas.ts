import * as v from "valibot";
import { COMMENTS_PARAMS, ThreadSchema, ThreadsSchema } from "../comments/schemas.js";
import { BodySchema, CountSchema, DescriptionSchema, type Raw, UuidSchema } from "../common/schemas.js";
import { exchange } from "../common/seal.js";
import type { ExchangeSchemas } from "../common/validate.js";
import { PageInfoSchema } from "../pages/schemas.js";
import { TypeContentSchema, TypeInfoRaw } from "../types/schemas.js";
import type { HostOperations, Presented } from "./operations.js";

const PresentedSchema: Raw<Presented> = v.object({ url: v.string() });

const presented = <Params>(params: Raw<Params>): Raw<Params & Presented> => v.intersect([params, PresentedSchema]);

export const HOST_OPERATION_SCHEMAS: ExchangeSchemas<HostOperations> = {
  pages_open: exchange(
    PresentedSchema,
    v.object({ page: PageInfoSchema, view: TypeContentSchema, type: v.exactOptional(TypeInfoRaw) }),
  ),
  comments_start: exchange(
    presented(v.object({ opId: UuidSchema, quote: v.exactOptional(DescriptionSchema), body: BodySchema })),
    ThreadSchema,
  ),
  pages_heads: exchange(
    PresentedSchema,
    v.object({
      version: CountSchema,
      seq: CountSchema,
      viewerSeq: v.exactOptional(CountSchema),
      comments: CountSchema,
    }),
  ),
  comments_list: exchange(presented(COMMENTS_PARAMS.comments_list), ThreadsSchema),
  comments_reply: exchange(presented(COMMENTS_PARAMS.comments_reply), ThreadSchema),
  comments_resolve: exchange(presented(COMMENTS_PARAMS.comments_resolve), ThreadSchema),
};
