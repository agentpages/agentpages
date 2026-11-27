import { faulty, storageSuite } from "@agentpages/conformance";
import { createMemoryStorage } from "@agentpages/server";
import type { Storage } from "@agentpages/storage";
import { describe, expect, test } from "vitest";
import { titlesBeside } from "./support/store.ts";

/** What the suite proves of a storage, by the requirement of the spec each test serves. */
const TITLES = [
  "[REL-6] what a transaction put is read back once it resolves",
  "[REL-7] the writes of a transaction are saved together, and none shows before",
  "[REL-7] a run reads only committed rows, never its own writes, which are saved in the order it made them",
  "[REL-8] a transaction rejects with what its run threw, and the next run on its lock goes on",
  "[REL-2] a transaction resolves with what its run returned",
  "[COMMON-4] a scan returns the keys under its prefix in code point order, up to its limit",
  "[COMMON-4] a scan after a key returns only what comes beyond it, whether or not the key exists",
  "[COMMON-4] a reverse scan returns the keys from the last one down, and after a key only those below it",
  "[PAGES-6] deleteRange removes exactly the keys under its prefix",
  "[REL-2] runs that share a lock key are serial, however their steps interleave",
  "[REL-2] a run waits for every run before it that holds one of its locks",
  "[REL-2] a run does not wait for runs that hold none of its locks",
];

describe("the memory storage", () => {
  storageSuite(createMemoryStorage);

  test("the suite registered every test of the storage contract", ({ task }) => {
    expect(titlesBeside(task)).toStrictEqual(TITLES);
  });
});

/** A storage with one value, which the test goes on to change after it was put. */
const withValue = async (): Promise<Storage> => {
  const storage = createMemoryStorage();
  const value = { tags: ["kept"] };
  await storage.transact([], (tx) => {
    tx.put("a", value);
    value.tags.push("added after the put");
    return Promise.resolve();
  });
  return storage;
};

const scribbleOn = (read: unknown): void => {
  Object.assign(read ?? {}, { tags: "changed after the read" });
};

test("the memory storage keeps a value as it was put, whatever happens to the object afterwards", async () => {
  const storage = await withValue();

  expect(await storage.get("a")).toStrictEqual({ tags: ["kept"] });
});

test("the memory storage hands out copies: changing what was read changes nothing that is stored", async () => {
  const storage = await withValue();
  const reads = [await storage.get("a"), ...(await storage.getMany(["a"])), ...(await storage.scan({ prefix: "", limit: 1 })).flat()];
  reads.forEach(scribbleOn);

  expect(await storage.get("a")).toStrictEqual({ tags: ["kept"] });
});

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

test("[REL-8] the memory storage saves nothing of a run that throws", async () => {
  const storage = await withKeys();
  const before = await storage.scan({ prefix: "", limit: 9 });
  const thrown = new Error("The run failed.");
  const failing = storage.transact(["lock"], (tx) => {
    tx.put("c", {});
    tx.delete("a");
    tx.deleteRange("b/");
    return Promise.reject(thrown);
  });

  await expect(failing).rejects.toBe(thrown);
  expect(await storage.scan({ prefix: "", limit: 9 })).toStrictEqual(before);
});

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
