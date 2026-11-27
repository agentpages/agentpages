import type { JsonRpcMessage } from "../jsonrpc/types.js";

export type Cancel = () => void;

/** One end of a channel between a view and its host. */
export interface Port {
  post(message: JsonRpcMessage): void;
  /** Calls `receive` with whatever arrives, checked by nobody yet, until cancelled. */
  listen(receive: (data: unknown) => void): Cancel;
}

export interface Timers {
  /** Calls `run` once after `ms` milliseconds, unless cancelled. */
  after(ms: number, run: () => void): Cancel;
}
