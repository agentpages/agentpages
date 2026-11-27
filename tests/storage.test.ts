import { storageSuite } from "@agentpages/conformance";
import { createMemoryStorage, type Storage } from "@agentpages/server";
import { describe, expect, test } from "vitest";
import { titlesBeside } from "./support/store.ts";

/** What the suite proves of a storage, by the requirement of the spec each test serves. */
const TITLES = [
  "[REL-6] what a transaction put is read back once it resolves",
  "[REL-7] the writes of a transaction are saved together, and none shows before",
  "[REL-7] a transaction reads its own writes, in the order it made them",
  "[REL-8] a run that throws saves nothing, and the transaction rejects with what it threw",
  "[REL-2] a transaction resolves with what its run returned",
  "[COMMON-4] a scan returns the keys under its prefix in code point order, up to its limit",
  "[COMMON-4] a scan after a key returns only what comes beyond it, whether or not the key exists",
  "[COMMON-4] a reverse scan returns the keys from the last one down, and after a key only those below it",
  "[PAGES-14] deleteRange removes exactly the keys under its prefix",
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
