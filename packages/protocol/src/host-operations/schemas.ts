import * as v from "valibot";
import { COMMENTS_ENTRIES, ThreadSchema, ThreadsSchema } from "../comments/schemas.js";
import { BodySchema, CountSchema, DescriptionSchema, type Raw, UuidSchema } from "../common/schemas.js";
import { exchange } from "../common/seal.js";
import type { ExchangeSchemas } from "../common/validate.js";
import { PageInfoSchema } from "../pages/schemas.js";
import { TypeContentSchema, TypeInfoRaw } from "../types/schemas.js";
import type { HostOperations, Presented } from "./operations.js";

const PresentedSchema: Raw<Presented> = v.object({ url: v.string() });

/** The params of an operation with the link the viewer presented, as one object. */
const presented = <Entries extends v.ObjectEntries>(
  entries: Entries,
): v.ObjectSchema<Entries & { url: Raw<string> }, undefined> => v.object({ ...entries, url: v.string() });

export const HOST_OPERATION_SCHEMAS: ExchangeSchemas<HostOperations> = {
  pages_open: exchange(
    PresentedSchema,
    v.object({ page: PageInfoSchema, view: TypeContentSchema, type: v.exactOptional(TypeInfoRaw) }),
  ),
  comments_start: exchange(
    presented({ opId: UuidSchema, quote: v.exactOptional(DescriptionSchema), body: BodySchema }),
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
  comments_list: exchange(presented(COMMENTS_ENTRIES.comments_list), ThreadsSchema),
  comments_reply: exchange(presented(COMMENTS_ENTRIES.comments_reply), ThreadSchema),
  comments_resolve: exchange(presented(COMMENTS_ENTRIES.comments_resolve), ThreadSchema),
};
