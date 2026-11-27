import type { Storage, Tx, Value } from "@agentpages/storage";
import { expect, test } from "vitest";
import { type Check, met } from "../store/kit.js";

/** What each case finds of the storages that `make` makes. */
export type Cases<M> = Record<string, (make: M) => Promise<Check>>;

/** Registers a test for each case. It passes when the case got what it wants. */
export const register = <M>(cases: Cases<M>, make: M): void => {
  test.each(Object.entries(cases))("%s", async (_, run) => {
    const check = await run(make);

    expect(check).toStrictEqual(met(check));
  });
};

export const ALL = 100;

export const locks = (...held: number[]): string[] => held.map((lock) => `lock-${lock}`);

export const key = (n: number): string => `key/${n}`;

export const value = (n: number): Value => ({ step: n, nested: { list: [n, null] } });

/** One transaction that makes these writes. */
export const write = (storage: Storage, change: (tx: Tx) => void): Promise<void> =>
  storage.transact(
    locks(),
    (tx) =>
      new Promise<void>((done) => {
        change(tx);
        done();
      }),
  );

/** Puts a value under each key. */
export const put = (storage: Storage, keys: string[]): Promise<void> =>
  write(storage, (tx) => {
    keys.forEach((name) => {
      tx.put(name, { at: name });
    });
  });

/** Puts key 3, and deletes key 1 and everything under key 2, such as keys 21 and 22. */
export const change = (tx: Tx): void => {
  tx.put(key(3), value(3));
  tx.delete(key(1));
  tx.deleteRange(key(2));
};

/** A run that makes the change, then ends as `end` does. */
export const changing =
  (end: () => Promise<void>) =>
  (tx: Tx): Promise<void> => {
    change(tx);
    return end();
  };

export const keysUnder = async (storage: Storage, prefix: string): Promise<string[]> =>
  (await storage.scan({ prefix, limit: ALL })).map(([name]) => name);

export const everyKey = (storage: Storage): Promise<string[]> => keysUnder(storage, String());

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
  async (tx: Tx): Promise<void> => {
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
export const arriving = ({ arrived, name, until }: Arrival): ((tx: Tx) => Promise<void>) =>
  numbered(() => {
    arrived.push(name);
    return Promise.resolve(until);
  });
