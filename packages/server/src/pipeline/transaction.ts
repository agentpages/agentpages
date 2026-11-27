import type { Key, Storage, Tx } from "@agentpages/storage";

type Fail = (error: unknown) => never;

const guarded = (tx: Tx, failed: Fail): Tx => ({
  get: (key) => tx.get(key).catch(failed),
  getMany: (keys) => tx.getMany(keys).catch(failed),
  scan: (range) => tx.scan(range).catch(failed),
  put: tx.put.bind(tx),
  delete: tx.delete.bind(tx),
  deleteRange: tx.deleteRange.bind(tx),
});

export interface Transaction<T> {
  storage: Storage;
  locks: Key[];
  run: (tx: Tx) => Promise<T>;
}

/**
 * Runs `run` in one transaction. Nothing comes back when the storage failed: the outcome is then unknown. Anything
 * else that is thrown inside is a defect, and is thrown on as it was.
 */
export const transact = <T>({ storage, locks, run }: Transaction<T>): Promise<T | undefined> => {
  const failures = new Set<unknown>();
  const defects = new Set<unknown>();
  const failed: Fail = (error) => {
    failures.add(error);
    throw error;
  };
  const sorted: Fail = (error) => {
    if (!failures.has(error)) defects.add(error);
    throw error;
  };
  return storage
    .transact(locks, (tx) => run(guarded(tx, failed)).catch(sorted))
    .catch((error: unknown): undefined => {
      if (defects.has(error)) throw error;
    });
};
