import type { Capability, Failure, JsonObject } from "@agentpages/protocol";

/**
 * The contracts the suites test, written out structurally: an adapter is tested as it is, and this package needs
 * nothing but the protocol.
 */
export type Stored = JsonObject | Uint8Array;

export interface Scan {
  prefix: string;
  after?: string;
  limit: number;
  reverse?: true;
}

export interface StorageReads {
  get(key: string): Promise<Stored | undefined>;
  getMany(keys: readonly string[]): Promise<(Stored | undefined)[]>;
  scan(scan: Scan): Promise<[string, Stored][]>;
}

export interface StorageWrites extends StorageReads {
  put(key: string, value: Stored): void;
  delete(key: string): void;
  deleteRange(prefix: string): void;
}

/** An ordered key-value store whose transactions are serial per lock key, atomic and durable. */
export interface StorageUnderTest extends StorageReads {
  transact<T>(locks: readonly string[], run: (tx: StorageWrites) => Promise<T>): Promise<T>;
}

/** What a Store answers: a result, a failure of the spec, or "method not found". */
export interface Reply {
  kind: "result" | "failure" | "unknown-method";
  result?: unknown;
  failure?: Failure;
  code?: number;
}

/** A viewer a host acts for: the page link they presented, and who they are when they are signed in. */
export interface Viewing {
  url: string;
  subject?: string;
}

/** A Store as the suite drives it. */
export interface Driver {
  capability: Capability;
  /** A tool call of the agent with this subject. */
  call(request: { tool: string; input: unknown; subject: string }): Promise<Reply>;
  /** An operation a host runs for a viewer. */
  host(request: { operation: string; input: unknown; viewer: Viewing }): Promise<Reply>;
  /** Moves the Store's clock forward by exactly `ms`. */
  advance(ms: number): void;
}
