import * as v from "valibot";
import {
  CountSchema,
  type ExchangeSchemas,
  IdSchema,
  NameSchema,
  type Schema,
  UuidSchema,
} from "../common/schemas.js";
import { FileInfoSchema } from "../files/schemas.js";
import type { RenderTools } from "./tools.js";
import type { Diagnostic, Place, RenderInput, RenderResult, Target } from "./types.js";

export const TargetSchema: Schema<Target> = v.variant("kind", [
  v.object({ kind: v.literal("viewport"), y: CountSchema }),
  v.object({ kind: v.literal("document") }),
  v.object({ kind: v.literal("node"), collection: IdSchema, id: IdSchema }),
]);

export const RenderInputSchema: Schema<RenderInput> = v.object({
  pageId: UuidSchema,
  version: v.exactOptional(CountSchema),
  viewport: v.object({ width: CountSchema, height: CountSchema }),
  theme: v.picklist(["light", "dark"]),
  target: TargetSchema,
});

export const PlaceSchema: Schema<Place> = v.object({
  selector: v.string(),
  text: v.exactOptional(v.string()),
  node: v.exactOptional(v.object({ collection: IdSchema, id: IdSchema })),
});

export const DiagnosticSchema: Schema<Diagnostic> = v.variant("kind", [
  v.object({ kind: v.literal("script-error"), message: v.string() }),
  v.object({
    kind: v.literal("request-failed"),
    url: v.string(),
    reason: v.picklist(["csp", "network", "http"]),
    status: v.exactOptional(v.number()),
  }),
  v.object({ kind: v.literal("image-broken"), at: PlaceSchema, src: v.string() }),
  v.object({ kind: v.literal("clipped"), at: PlaceSchema, axis: v.picklist(["x", "y"]), overflowPx: v.number() }),
  v.object({ kind: v.literal("outside-viewport"), at: PlaceSchema, overflowPx: v.number() }),
  v.object({ kind: v.literal("bridge-error"), method: v.string(), error: v.string() }),
]);

const outcomeEntries = {
  version: CountSchema,
  seq: CountSchema,
  settled: v.boolean(),
  diagnostics: v.array(DiagnosticSchema),
  diagnosticsTruncated: v.boolean(),
};

export const RenderResultSchema: Schema<RenderResult> = v.object({
  ...outcomeEntries,
  image: v.object({ mimeType: v.literal("image/png"), width: v.number(), height: v.number() }),
});

export const RENDER_TOOL_SCHEMAS: ExchangeSchemas<RenderTools> = {
  pages_render: { params: RenderInputSchema, result: RenderResultSchema },
  pages_export: {
    params: v.object({
      opId: UuidSchema,
      pageId: UuidSchema,
      version: v.exactOptional(CountSchema),
      fileId: IdSchema,
      name: NameSchema,
      format: v.string(),
    }),
    result: v.object({ ...outcomeEntries, file: FileInfoSchema }),
  },
};
