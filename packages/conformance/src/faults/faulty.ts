import type { StorageReads, StorageUnderTest, StorageWrites } from "../contract.js";

/** Where a storage can fail or be held up. A transaction commits between `commit` and `committed`. */
export type FaultPoint = "get" | "getMany" | "scan" | "commit" | "committed";

/** Decides what happens at a point: throw to fail there, return a promise to wait there. */
export type Plan = (point: FaultPoint) => unknown;

const reading = (reads: StorageReads, plan: Plan): StorageReads => ({
  get: async (key) => {
    await plan("get");
    return reads.get(key);
  },
  getMany: async (keys) => {
    await plan("getMany");
    return reads.getMany(keys);
  },
  scan: async (scan) => {
    await plan("scan");
    return reads.scan(scan);
  },
});

const writing = (tx: StorageWrites, plan: Plan): StorageWrites => ({
  ...reading(tx, plan),
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
export const faulty = (storage: StorageUnderTest, plan: Plan): StorageUnderTest => ({
  ...reading(storage, plan),
  transact: async (locks, run) => {
    const result = await storage.transact(locks, async (tx) => {
      const value = await run(writing(tx, plan));
      await plan("commit");
      return value;
    });
    await plan("committed");
    return result;
  },
});
