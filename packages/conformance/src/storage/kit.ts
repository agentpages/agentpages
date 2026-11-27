import type { Stored, StorageUnderTest, StorageWrites } from "../contract.js";

export const ALL = 100;

export const locks = (...held: number[]): string[] => held.map((lock) => `lock-${lock}`);

export const key = (n: number): string => `key/${n}`;

export const value = (n: number): Stored => ({ step: n, nested: { list: [n, null] } });

/** One transaction that makes these writes. */
export const write = (storage: StorageUnderTest, change: (tx: StorageWrites) => void): Promise<void> =>
  storage.transact(
    locks(),
    (tx) =>
      new Promise<void>((done) => {
        change(tx);
        done();
      }),
  );

/** Puts a value under each key. */
export const put = (storage: StorageUnderTest, keys: string[]): Promise<void> =>
  write(storage, (tx) => {
    keys.forEach((name) => {
      tx.put(name, { at: name });
    });
  });

export const keysUnder = async (storage: StorageUnderTest, prefix: string): Promise<string[]> =>
  (await storage.scan({ prefix, limit: ALL })).map(([name]) => name);

export const everyKey = (storage: StorageUnderTest): Promise<string[]> => keysUnder(storage, String());

export interface Gate {
  opened: Promise<void>;
  open: () => void;
}

export const gate = (): Gate => {
  const openers: (() => void)[] = [];
  const opened = new Promise<void>((resolve) => {
    openers.push(resolve);
  });
  return {
    opened,
    open: () => {
      openers.forEach((opener) => {
        opener();
      });
    },
  };
};

/** Lets everything that can run without a timer run. */
export const settled = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

export const RUNS = "run/";

/** A run that reads how many runs came before, does `meanwhile`, then adds itself. Serial runs get their own number. */
export const numbered =
  (meanwhile: () => Promise<unknown>) =>
  async (tx: StorageWrites): Promise<void> => {
    const earlier = await tx.scan({ prefix: RUNS, limit: ALL });
    await meanwhile();
    tx.put(`${RUNS}${earlier.length}`, {});
  };

export interface Arrival {
  /** Where the run notes that it started. */
  arrived: string[];
  name: string;
  until?: Promise<void>;
}

/** A run that says it arrived, then waits for `until`. */
export const arriving = ({ arrived, name, until }: Arrival): ((tx: StorageWrites) => Promise<void>) =>
  numbered(() => {
    arrived.push(name);
    return Promise.resolve(until);
  });
