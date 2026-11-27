import type { Actor, Scope } from "../state/types.js";

export interface LogRecord {
  at: string;
  requestId: string;
  opId?: string;
  pageId?: string;
  scope?: Scope;
  seq?: number;
  actor: Actor;
  method: string;
  outcome: "ok" | "error";
  error?: string;
  cause?: string;
  durationMs: number;
}
