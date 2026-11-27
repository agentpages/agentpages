import { across, faulty } from "@agentpages/conformance";
import { createMemoryStorage } from "@agentpages/server";
import type { Range, Storage, Tx } from "@agentpages/storage";
import { expect, test } from "vitest";
import { wholeStorageSuite } from "./support/storage.ts";

const ALL: Range = { prefix: "", limit: 9 };

wholeStorageSuite("the memory storage", createMemoryStorage);

test("faulty tells its plan every point the storage reaches, with the keys and the locks of the call", async () => {
  const reached: unknown[] = [];
  const storage = faulty(createMemoryStorage(), (point, touched) => reached.push([point, touched]));
  await storage.get("a");
  await storage.getMany(["b", "c"]);
  await storage.scan({ prefix: "d/", limit: 1 });
  await storage.transact(["lock-1", "lock-2"], async (tx) => {
    await tx.get("e");
    await tx.getMany(["f", "g"]);
    await tx.scan({ prefix: "h/", limit: 1 });
    tx.put("i", {});
  });
  const locks = ["lock-1", "lock-2"];

  expect(reached).toStrictEqual([
    ["get", { keys: ["a"], locks: [] }],
    ["getMany", { keys: ["b", "c"], locks: [] }],
    ["scan", { keys: ["d/"], locks: [] }],
    ["get", { keys: ["e"], locks }],
    ["getMany", { keys: ["f", "g"], locks }],
    ["scan", { keys: ["h/"], locks }],
    ["commit", { keys: [], locks }],
    ["committed", { keys: [], locks }],
  ]);
  expect(await storage.get("i")).toStrictEqual({});
});

/** A run that puts an empty object under a key and returns the key. */
const putting =
  (key: string) =>
  (tx: Tx): Promise<string> => {
    tx.put(key, {});
    return Promise.resolve(key);
  };

test("across sends each call to the next of its storages in turn, and starts again after the last", async () => {
  const [first, second] = [createMemoryStorage(), createMemoryStorage()];
  const both = across([first, second]);
  const answers = [await both.transact([], putting("a")), await both.transact([], putting("b")), await both.transact([], putting("c"))];
  const reads = [await both.get("b"), await both.get("b"), await both.getMany(["a"]), await both.getMany(["a"]), await both.scan(ALL), await both.scan(ALL)];

  expect(answers).toStrictEqual(["a", "b", "c"]);
  expect(reads).toStrictEqual([{}, undefined, [undefined], [{}], [["b", {}]], [["a", {}], ["c", {}]]]);
  expect([await first.scan(ALL), await second.scan(ALL)]).toStrictEqual([[["a", {}], ["c", {}]], [["b", {}]]]);
});

/** A storage with the keys `a` and `b/1`. */
const withKeys = async (): Promise<Storage> => {
  const storage = createMemoryStorage();
  await storage.transact([], (tx) => {
    tx.put("a", { was: "a" });
    tx.put("b/1", { was: "b/1" });
    return Promise.resolve();
  });
  return storage;
};

test("[REL-7] the memory storage saves the writes of a run in the order the run made them", async () => {
  const storage = await withKeys();
  await storage.transact([], (tx) => {
    tx.delete("a");
    tx.put("a", { now: 1 });
    tx.put("a", { now: 2 });
    tx.put("b/2", {});
    tx.deleteRange("b/");
    tx.put("b/3", {});
    tx.put("c", {});
    tx.delete("c");
    return Promise.resolve();
  });

  expect(await storage.scan({ prefix: "", limit: 9 })).toStrictEqual([
    ["a", { now: 2 }],
    ["b/3", {}],
  ]);
});
