import type { Storage } from "@agentpages/storage";

function* inTurn<T>(items: readonly T[]): Generator<T, never> {
  for (;;) yield* items;
}

/**
 * One Storage over several: each call goes to the next of them in turn. Over several connections to one database,
 * `storageSuite` then proves that their runs are serial per lock key.
 */
export const across = (storages: readonly [Storage, ...Storage[]]): Storage => {
  const turns = inTurn(storages);
  const next = (): Storage => turns.next().value;
  return {
    get: (key) => next().get(key),
    getMany: (keys) => next().getMany(keys),
    scan: (range) => next().scan(range),
    transact: (locks, run) => next().transact(locks, run),
  };
};
