import type { ErrorData } from "../errors/types.js";

/** The JSON-RPC error of a failed view method. */
export interface JsonRpcError {
  code: number;
  message: string;
  data: ErrorData;
}
