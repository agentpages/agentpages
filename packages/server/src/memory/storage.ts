import type { Key, Range, Reader, Storage, Tx, Value } from "../ports/storage.js";

type Rows = Map<Key, Value>;

type Write = (rows: Rows) => void;

const isBeyond =
  ({ after, reverse }: Range) =>
  (key: Key): boolean =>
    after === undefined || (reverse === true ? key < after : key > after);

const scanned = (rows: Rows, range: Range): [Key, Value][] => {
  const keys = [...rows.keys()].filter((key) => key.startsWith(range.prefix));
  keys.sort();
  if (range.reverse === true) keys.reverse();
  return keys
    .filter(isBeyond(range))
    .slice(0, range.limit)
    .map((key) => [key, structuredClone(rows.get(key) ?? {})]);
};

/** Reads of the rows as they are when each read happens. */
const readerOf = (rowsNow: () => Rows): Reader => ({
  get: (key) => Promise.resolve(structuredClone(rowsNow().get(key))),
  getMany: (keys) => Promise.resolve(keys.map((key) => structuredClone(rowsNow().get(key)))),
  scan: (range) => Promise.resolve(scanned(rowsNow(), range)),
});

const applied = (rows: Rows, writes: Write[]): Rows => {
  writes.forEach((write) => {
    write(rows);
  });
  return rows;
};

const deleteRange =
  (prefix: Key): Write =>
  (rows) => {
    [...rows.keys()]
      .filter((key) => key.startsWith(prefix))
      .forEach((key) => {
        rows.delete(key);
      });
  };

/** A transaction buffers its writes. Its reads see the committed rows with those writes on top. */
const txOf = (rows: Rows, writes: Write[]): Tx => ({
  ...readerOf(() => applied(new Map(rows), writes)),
  put: (key, value) => {
    const copy = structuredClone(value);
    writes.push((target) => {
      target.set(key, copy);
    });
  },
  delete: (key) => {
    writes.push((target) => {
      target.delete(key);
    });
  },
  deleteRange: (prefix) => {
    writes.push(deleteRange(prefix));
  },
});

/**
 * A Storage that keeps everything in memory, for tests and for trying things out. One process, nothing survives it.
 */
export const createMemoryStorage = (): Storage => {
  const rows: Rows = new Map();
  const tails = new Map<Key, Promise<unknown>>();
  const commit = async <T>(run: (tx: Tx) => Promise<T>): Promise<T> => {
    const writes: Write[] = [];
    const result = await run(txOf(rows, writes));
    applied(rows, writes);
    return result;
  };
  return {
    ...readerOf(() => rows),
    transact: (locks, run) => {
      const turn = Promise.all(locks.map((lock) => Promise.resolve(tails.get(lock))));
      const done = turn.then(() => commit(run));
      const settled = Promise.allSettled([done]);
      locks.forEach((lock) => {
        tails.set(lock, settled);
      });
      return done;
    },
  };
};
