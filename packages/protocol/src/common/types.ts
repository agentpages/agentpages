/** A JSON object the protocol carries without interpreting it. */
export type JsonObject = Record<string, unknown>;

/** The spec's `{}`: no fields of its own. */
export type Empty = Record<string, never>;

export interface Paging {
  cursor?: string;
  limit?: number;
}

export interface Exchange {
  params: unknown;
  result: unknown;
}
