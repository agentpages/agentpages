import type { Problem } from "../errors/types.js";
import type { RenderLimits } from "../extension/types.js";
import type { RenderInput } from "./types.js";

export interface ViewportCheck {
  viewport: RenderInput["viewport"];
  limits: RenderLimits;
}

/** The render limit a well-formed `viewport` breaks, if any. */
export const viewportProblem = ({ viewport, limits }: ViewportCheck): Problem | undefined =>
  viewport.width > limits.maxWidth || viewport.height > limits.maxHeight
    ? {
        error: "LimitExceeded",
        message: `viewport ${viewport.width}x${viewport.height} is larger than ${limits.maxWidth}x${limits.maxHeight}`,
      }
    : undefined;
