import type { Storage } from "@agentpages/storage";
import { type Cases, changing, everyKey, type Gate, gate, key, locks, numbered, put, register, settled } from "./kit.js";

/** A storage that outlives the process that opened it. */
export interface Durable {
  /** Opens the storage once more, as another process would. */
  open: () => Storage;
  /** Lets enough time pass that every run that started before may lose its locks. */
  expire: () => void;
}

export type MakeDurable = () => Durable;

interface Lost {
  stale: Storage;
  other: Storage;
  /** Where the run of `stale` waits. */
  held: Gate;
  /** What the run of `stale` rejected with, or nothing when it resolved. */
  late: Promise<unknown>;
}

/** Two openings of a storage with keys 1 and 21. A run of the first makes the change under lock 1, and the time of its lease passes. */
const losing = async ({ open, expire }: Durable): Promise<Lost> => {
  const [stale, other] = [open(), open()];
  await put(stale, [key(1), key(21)]);
  const held = gate();
  const late = stale
    .transact(
      locks(1),
      changing(() => held.opened),
    )
    .catch((error: unknown) => error);
  await settled();
  expire();
  return { stale, other, held, late };
};

const CASES: Cases<MakeDurable> = {
  "[REL-6] what a transaction saved is read through a later opening": async (make) => {
    const { open } = make();
    await put(open(), [key(1)]);
    return { got: await everyKey(open()), want: ["key/1"] };
  },

  "[REL-2] a run that lost its lock to another run rejects and saves nothing, and its storage goes on": async (make) => {
    const { stale, other, held, late } = await losing(make());
    await other.transact(locks(1), numbered(settled));
    held.open();
    const rejection = await late;
    const afterLate = await everyKey(other);
    await stale.transact(locks(1), changing(settled));
    return {
      got: [rejection instanceof Error, afterLate, await everyKey(other)],
      want: [true, ["key/1", "key/21", "run/0"], ["key/3", "run/0"]],
    };
  },

  "[REL-2] a run that lost its lock rejects while the run that took it still runs, and that run saves": async (make) => {
    const { other, held, late } = await losing(make());
    const taken = gate();
    const taker = other.transact(
      locks(1),
      numbered(() => taken.opened),
    );
    await settled();
    held.open();
    const rejection = await late;
    const whileTaken = await everyKey(other);
    taken.open();
    await taker;
    return {
      got: [rejection instanceof Error, whileTaken, await everyKey(other)],
      want: [true, ["key/1", "key/21"], ["key/1", "key/21", "run/0"]],
    };
  },
};

/**
 * Registers the tests of a storage that several processes open. `make` returns a new, empty one each time. Every
 * title starts with the requirement of the spec the test serves.
 */
export const durableSuite = (make: MakeDurable): void => {
  register(CASES, make);
};
