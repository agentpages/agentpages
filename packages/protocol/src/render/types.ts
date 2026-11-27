export type Target =
  | { kind: "viewport"; y: number }
  | { kind: "document" }
  | { kind: "node"; collection: string; id: string };

export interface RenderInput {
  pageId: string;
  version?: number;
  viewport: { width: number; height: number };
  theme: "light" | "dark";
  target: Target;
}

export interface RenderResult {
  version: number;
  seq: number;
  settled: boolean;
  image: { mimeType: "image/png"; width: number; height: number };
  diagnostics: Diagnostic[];
  diagnosticsTruncated: boolean;
}

export interface Place {
  selector: string;
  text?: string;
  node?: { collection: string; id: string };
}

export type Diagnostic =
  | { kind: "script-error"; message: string }
  | { kind: "request-failed"; url: string; reason: "csp" | "network" | "http"; status?: number }
  | { kind: "image-broken"; at: Place; src: string }
  | { kind: "clipped"; at: Place; axis: "x" | "y"; overflowPx: number }
  | { kind: "outside-viewport"; at: Place; overflowPx: number }
  | { kind: "bridge-error"; method: string; error: string };
