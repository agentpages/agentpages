import * as fc from "fast-check";
import type { Storage } from "@agentpages/storage";
import { ALL, arriving, type Cases, change, changing, everyKey, type Gate, gate, key, keysUnder, locks, numbered, put, register, RUNS, settled, value, write } from "./kit.js";

export type MakeStorage = () => Storage | Promise<Storage>;

interface Held {
  first: Gate;
  arrived: string[];
  held: Promise<void>;
}

/** Starts a run on lock 1 that waits at a gate. */
const holding = (storage: Storage): Held => {
  const first = gate();
  const arrived: string[] = [];
  return { first, arrived, held: storage.transact(locks(1), arriving({ arrived, name: key(1), until: first.opened })) };
};

const MIB = 1_048_576;

const CASES: Cases<MakeStorage> = {
  "[REL-6] what a transaction put is read back once it resolves": async (make) => {
    const storage = await make();
    await write(storage, (tx) => {
      tx.put(key(1), value(1));
      tx.put(key(2), new Uint8Array([0, 255, 7]));
    });
    return {
      got: [
        await storage.get(key(1)),
        await storage.get(key(3)),
        await storage.getMany([key(2), key(3), key(1)]),
        await storage.scan({ prefix: key(2), limit: ALL }),
      ],
      want: [
        { step: 1, nested: { list: [1, null] } },
        undefined,
        [new Uint8Array([0, 255, 7]), undefined, value(1)],
        [["key/2", new Uint8Array([0, 255, 7])]],
      ],
    };
  },

  "[FILES-5] bytes of 4 MiB with every byte value are read back as they were put": async (make) => {
    const storage = await make();
    const bytes = Uint8Array.from({ length: 4 * MIB }, (_, at) => at);
    await write(storage, (tx) => {
      tx.put(key(1), bytes);
    });
    return {
      got: [bytes.length, new Set(bytes).size, await storage.get(key(1))],
      want: [4_194_304, 256, bytes],
    };
  },

  "[REL-7] the writes of a transaction are saved together, and none shows before": async (make) => {
    const storage = await make();
    await put(storage, [key(1), key(21), key(22)]);
    const during = await storage.transact(locks(), async (tx) => {
      change(tx);
      return [await storage.getMany([key(3), key(1), key(21)]), await everyKey(storage)];
    });
    return {
      got: [during, await everyKey(storage)],
      want: [
        [
          [undefined, { at: key(1) }, { at: key(21) }],
          [key(1), key(21), key(22)],
        ],
        [key(3)],
      ],
    };
  },

  "[REL-7] a run reads only committed rows, never its own writes, which are saved in the order it made them": async (make) => {
    const storage = await make();
    await put(storage, [key(1), key(21)]);
    const committed = [
      [key(1), { at: key(1) }],
      [key(21), { at: key(21) }],
    ];
    const seen = await storage.transact(locks(), async (tx) => {
      tx.deleteRange(key(2));
      tx.put(key(22), value(3));
      tx.delete(key(1));
      return [await tx.get(key(1)), await tx.getMany([key(21), key(22)]), await tx.scan({ prefix: String(), limit: ALL })];
    });
    return {
      got: [seen, await storage.scan({ prefix: String(), limit: ALL })],
      want: [[{ at: key(1) }, [{ at: key(21) }, undefined], committed], [[key(22), value(3)]]],
    };
  },

  "[REL-7] a value is saved as it is when it is put, whatever happens to it afterwards": async (make) => {
    const storage = await make();
    const json = { tags: [key(1)] };
    const bytes = new Uint8Array([1, 2]);
    await write(storage, (tx) => {
      tx.put(key(1), json);
      tx.put(key(2), bytes);
      json.tags.push(key(2));
      bytes.fill(9);
    });
    return {
      got: [json, bytes, await storage.getMany([key(1), key(2)])],
      want: [{ tags: ["key/1", "key/2"] }, new Uint8Array([9, 9]), [{ tags: ["key/1"] }, new Uint8Array([1, 2])]],
    };
  },

  "[REL-7] a read returns a copy: a change of it changes nothing that is saved": async (make) => {
    const storage = await make();
    await write(storage, (tx) => {
      tx.put(key(4), value(4));
    });
    const reads = [await storage.get(key(4)), ...(await storage.getMany([key(4)])), ...(await storage.scan({ prefix: key(4), limit: ALL })).flat()];
    reads.forEach((read) => {
      Object.assign(read ?? {}, value(5));
    });
    return { got: [reads, await storage.get(key(4))], want: [[value(5), value(5), "key/4", value(5)], value(4)] };
  },

  "[REL-7] a key named __proto__ in a value is read back as it was put": async (make) => {
    const storage = await make();
    await write(storage, (tx) => {
      tx.put(key(1), Object.fromEntries([["__proto__", value(1)]]));
    });
    const read = (await storage.get(key(1))) ?? {};
    return { got: [Object.keys(read), Object.values(read)], want: [["__proto__"], [value(1)]] };
  },

  "[REL-8] a transaction rejects with what its run threw, and the next run on its lock goes on": async (make) => {
    const storage = await make();
    const thrown = new Error(key(9));
    const rejection: unknown = await storage.transact(locks(1), () => Promise.reject(thrown)).catch((error: unknown) => error);
    await storage.transact(locks(1), numbered(settled));
    return { got: [rejection, await everyKey(storage)], want: [thrown, [`${RUNS}0`]] };
  },

  "[REL-8] a run that throws saves none of the writes that a run that returns saves": async (make) => {
    const storage = await make();
    await put(storage, [key(1), key(21), key(22)]);
    const thrown = storage.transact(
      locks(1),
      changing(() => Promise.reject(new Error(key(9)))),
    );
    const afterThrow = await thrown.catch(() => everyKey(storage));
    await storage.transact(locks(1), changing(settled));
    return { got: [afterThrow, await everyKey(storage)], want: [[key(1), key(21), key(22)], [key(3)]] };
  },

  "[REL-2] a transaction resolves with what its run returned": async (make) => {
    const storage = await make();
    return { got: await storage.transact(locks(1), () => storage.getMany([key(1)])), want: [undefined] };
  },

  "[COMMON-4] a scan returns the keys under its prefix in code point order, up to its limit": async (make) => {
    const storage = await make();
    await put(storage, ["p/b", "p/B", "q/a", "p/a/1", "p/10", "p/9", "p", "o/z", "p/_"]);
    return {
      got: [await keysUnder(storage, "p/"), await storage.scan({ prefix: "p/", limit: 2 }), await keysUnder(storage, "r"), await everyKey(storage)],
      want: [
        ["p/10", "p/9", "p/B", "p/_", "p/a/1", "p/b"],
        [
          ["p/10", { at: "p/10" }],
          ["p/9", { at: "p/9" }],
        ],
        [],
        ["o/z", "p", "p/10", "p/9", "p/B", "p/_", "p/a/1", "p/b", "q/a"],
      ],
    };
  },

  "[COMMON-4] a scan after a key returns only what comes beyond it, whether or not the key exists": async (make) => {
    const storage = await make();
    await put(storage, ["p/1", "p/2", "p/3", "p/4", "q/1"]);
    const after = async (bound: string): Promise<string[]> =>
      (await storage.scan({ prefix: "p/", after: bound, limit: 2 })).map(([name]) => name);
    return {
      got: [await after("p/1"), await after("p/25"), await after("p/4"), await after(String()), await everyKey(storage)],
      want: [["p/2", "p/3"], ["p/3", "p/4"], [], ["p/1", "p/2"], ["p/1", "p/2", "p/3", "p/4", "q/1"]],
    };
  },

  "[COMMON-4] a reverse scan returns the keys from the last one down, and after a key only those below it": async (make) => {
    const storage = await make();
    await put(storage, ["o/1", "p/1", "p/2", "p/3", "p/4", "q/1"]);
    const down = async (bound: { after?: string }): Promise<string[]> =>
      (await storage.scan({ prefix: "p/", limit: 2, reverse: true, ...bound })).map(([name]) => name);
    return {
      got: [await down({}), await down({ after: "p/4" }), await down({ after: "p/25" }), await down({ after: "p/2" }), await everyKey(storage)],
      want: [["p/4", "p/3"], ["p/3", "p/2"], ["p/2", "p/1"], ["p/1"], ["o/1", "p/1", "p/2", "p/3", "p/4", "q/1"]],
    };
  },

  "[COMMON-4] a prefix covers the keys that go on from it with a space and with a tilde, in scan and deleteRange": async (make) => {
    const storage = await make();
    await put(storage, ["o~", "p", "p x", "p~x", "q "]);
    const under = await keysUnder(storage, "p");
    await write(storage, (tx) => {
      tx.deleteRange("p");
    });
    return { got: [under, await everyKey(storage)], want: [["p", "p x", "p~x"], ["o~", "q "]] };
  },

  "[PAGES-6] deleteRange removes exactly the keys under its prefix": async (make) => {
    const storage = await make();
    await put(storage, ["page/1/a", "page/1/b/c", "page/10/a", "page/1", "x/page/1/a"]);
    await write(storage, (tx) => {
      tx.deleteRange("page/1/");
    });
    return { got: await everyKey(storage), want: ["page/1", "page/10/a", "x/page/1/a"] };
  },

  "[REL-2] runs that share a lock key are serial, however their steps interleave": async (make) => {
    const counted: unknown[] = [];
    await fc.assert(
      fc.asyncProperty(fc.scheduler(), async (scheduler) => {
        const storage = await make();
        const run = numbered(() => scheduler.schedule(settled()));
        const runs = [locks(1), locks(1, 2), locks(2, 1)].map((held) => storage.transact(held, run));
        await scheduler.waitFor(Promise.all(runs));
        counted.push([await keysUnder(storage, RUNS), scheduler.report().length]);
      }),
    );
    return {
      got: [new Set(counted.map((run) => JSON.stringify(run))), counted.length],
      want: [new Set([JSON.stringify([["run/0", "run/1", "run/2"], 3])]), 100],
    };
  },

  "[REL-2] a run waits for every run before it that holds one of its locks": async (make) => {
    const storage = await make();
    const { first, arrived, held } = holding(storage);
    const runs = [
      held,
      storage.transact(locks(2, 1), arriving({ arrived, name: key(2) })),
      storage.transact(locks(2), arriving({ arrived, name: key(3) })),
    ];
    await settled();
    const whileHeld = arrived.join();
    first.open();
    await Promise.all(runs);
    return { got: [whileHeld, arrived, await keysUnder(storage, RUNS)], want: [key(1), [key(1), key(2), key(3)], ["run/0", "run/1", "run/2"]] };
  },

  "[REL-2] a run does not wait for runs that hold none of its locks": async (make) => {
    const storage = await make();
    const { first, arrived, held } = holding(storage);
    await settled();
    await storage.transact(locks(2), arriving({ arrived, name: key(2) }));
    await storage.transact(locks(), arriving({ arrived, name: key(3) }));
    const whileHeld = await keysUnder(storage, RUNS);
    first.open();
    await held;
    return { got: [whileHeld, arrived, await keysUnder(storage, RUNS)], want: [["run/0", "run/1"], [key(1), key(2), key(3)], ["run/0", "run/1"]] };
  },
};

/**
 * Registers the tests of the storage contract. `make` returns a new, empty storage each time. Every title starts
 * with the requirement of the spec the test serves.
 */
export const storageSuite = (make: MakeStorage): void => {
  register(CASES, make);
};
