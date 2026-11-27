/** ASCII, ordered by code point. The Store encodes its tuples into keys. */
export type Key = string;

/** A JSON object or bytes. Bytes may be as large as the largest file the Store accepts. */
export type Value = Record<string, unknown> | Uint8Array;

export interface Range {
  prefix: Key;
  /** Only keys beyond this one in the direction of the scan. It need not be a key that exists. */
  after?: Key;
  limit: number;
  reverse?: true;
}

/** Each read is atomic. Two reads may see different commits unless a held lock excludes the writer. */
export interface Reader {
  get(key: Key): Promise<Value | undefined>;
  getMany(keys: readonly Key[]): Promise<(Value | undefined)[]>;
  scan(range: Range): Promise<[Key, Value][]>;
}

/**
 * Writes are buffered and saved together at commit, in call order. Reads in a run see only committed rows, never the
 * run's own writes.
 */
export interface Tx extends Reader {
  put(key: Key, value: Value): void;
  delete(key: Key): void;
  deleteRange(prefix: Key): void;
}

export interface Storage extends Reader {
  /**
   * Runs are serial per lock key, across every process that shares the storage. The writes of a run are saved all or
   * not at all, and are durable when the promise resolves. A run that throws saves nothing. A rejection means the
   * outcome is unknown.
   */
  transact<T>(locks: readonly Key[], run: (tx: Tx) => Promise<T>): Promise<T>;
}
