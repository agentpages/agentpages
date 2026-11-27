import * as v from "valibot";
import { CountSchema, IdSchema, NameSchema, type Raw, UuidSchema } from "../common/schemas.js";
import { exchange } from "../common/seal.js";
import type { ExchangeSchemas } from "../common/validate.js";
import { FileInfoSchema } from "../files/schemas.js";
import { MAX_DIAGNOSTICS } from "./constants.js";
import type { RenderTools } from "./tools.js";
import type { Diagnostic, Place } from "./types.js";

const PlaceSchema: Raw<Place> = v.object({
  selector: v.string(),
  text: v.exactOptional(v.string()),
  node: v.exactOptional(v.object({ collection: IdSchema, id: IdSchema })),
});

const DiagnosticSchema: Raw<Diagnostic> = v.variant("kind", [
  v.object({ kind: v.literal("script-error"), message: v.string() }),
  v.object({
    kind: v.literal("request-failed"),
    url: v.string(),
    reason: v.picklist(["csp", "network", "http"]),
    status: v.exactOptional(CountSchema),
  }),
  v.object({ kind: v.literal("image-broken"), at: PlaceSchema, src: v.string() }),
  v.object({ kind: v.literal("clipped"), at: PlaceSchema, axis: v.picklist(["x", "y"]), overflowPx: CountSchema }),
  v.object({ kind: v.literal("outside-viewport"), at: PlaceSchema, overflowPx: CountSchema }),
  v.object({ kind: v.literal("bridge-error"), method: v.string(), error: v.string() }),
]);

const outcomeEntries = {
  version: CountSchema,
  seq: CountSchema,
  settled: v.boolean(),
  diagnostics: v.pipe(v.array(DiagnosticSchema), v.maxLength(MAX_DIAGNOSTICS)),
  diagnosticsTruncated: v.boolean(),
};

export const RENDER_TOOL_PARAMS: { readonly [T in keyof RenderTools]: Raw<RenderTools[T]["params"]> } = {
  pages_render: v.object({
    pageId: UuidSchema,
    version: v.exactOptional(CountSchema),
    viewport: v.object({ width: CountSchema, height: CountSchema }),
    theme: v.picklist(["light", "dark"]),
    target: v.variant("kind", [
      v.object({ kind: v.literal("viewport"), y: CountSchema }),
      v.object({ kind: v.literal("document") }),
      v.object({ kind: v.literal("node"), collection: IdSchema, id: IdSchema }),
    ]),
  }),
  pages_export: v.object({
    opId: UuidSchema,
    pageId: UuidSchema,
    version: v.exactOptional(CountSchema),
    fileId: IdSchema,
    name: NameSchema,
    format: IdSchema,
  }),
};

export const RENDER_TOOL_SCHEMAS: ExchangeSchemas<RenderTools> = {
  pages_render: exchange(
    RENDER_TOOL_PARAMS.pages_render,
    v.object({
      ...outcomeEntries,
      image: v.object({ mimeType: v.literal("image/png"), width: CountSchema, height: CountSchema }),
    }),
  ),
  pages_export: exchange(RENDER_TOOL_PARAMS.pages_export, v.object({ ...outcomeEntries, file: FileInfoSchema })),
};
