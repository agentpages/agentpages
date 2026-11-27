import type { Key, Reader, Storage, Tx } from "@agentpages/storage";

/** Where a storage can fail or be held up. A transaction commits between `commit` and `committed`. */
export type FaultPoint = "get" | "getMany" | "scan" | "commit" | "committed";

/** The call that reached a point: the keys it reads, which for a scan is its prefix, and the locks it runs under. */
export interface Touched {
  keys: readonly Key[];
  locks: readonly Key[];
}

/** Decides what happens at a point: throw to fail there, return a promise to wait there. */
export type Plan = (point: FaultPoint, touched: Touched) => unknown;

interface Watch {
  plan: Plan;
  locks: readonly Key[];
}

const reading = (reads: Reader, { plan, locks }: Watch): Reader => ({
  get: async (key) => {
    await plan("get", { keys: [key], locks });
    return reads.get(key);
  },
  getMany: async (keys) => {
    await plan("getMany", { keys, locks });
    return reads.getMany(keys);
  },
  scan: async (range) => {
    await plan("scan", { keys: [range.prefix], locks });
    return reads.scan(range);
  },
});

const writing = (tx: Tx, watch: Watch): Tx => ({
  ...reading(tx, watch),
  put: (key, value) => {
    tx.put(key, value);
  },
  delete: (key) => {
    tx.delete(key);
  },
  deleteRange: (prefix) => {
    tx.deleteRange(prefix);
  },
});

/**
 * `storage`, failing or waiting where `plan` says. A failure at `commit` loses the whole transaction. One at
 * `committed` loses only the answer: the transaction is saved.
 */
export const faulty = (storage: Storage, plan: Plan): Storage => ({
  ...reading(storage, { plan, locks: [] }),
  transact: async (locks, run) => {
    const result = await storage.transact(locks, async (tx) => {
      const value = await run(writing(tx, { plan, locks }));
      await plan("commit", { keys: [], locks });
      return value;
    });
    await plan("committed", { keys: [], locks });
    return result;
  },
});
