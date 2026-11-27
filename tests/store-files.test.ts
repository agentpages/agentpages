import { type Answer, TOOL_SCHEMAS } from "@agentpages/protocol";
import type { Storage } from "@agentpages/storage";
import { expect, test } from "vitest";
import { ADVERTISED, ask, call, errorOf, op, PAGE, PUBLISHED, resultOf, sharedPage, transactingAs, viewerId, world, type World } from "./support/store.ts";

/** A put of the file `a`, of three bytes, under `opId` number `n`. */
const putting = (n: number): Record<string, unknown> => ({ opId: op(n), id: "a", name: "a.bin", mimeType: "application/octet-stream", blob: "AP8H" });

const put = (target: World, n: number): Promise<Answer> => call(target, ["files_put", { pageId: PAGE, ...putting(n) }]);

/** A Store with `PAGE` and its file `a`. */
const withFile = async (): Promise<World> => {
  const target = world();
  await call(target, PUBLISHED);
  await put(target, 2);
  return target;
};

/** How many of the values the Store has saved are bytes. */
const bytesIn = async (storage: Storage): Promise<number> =>
  (await storage.scan({ prefix: "", limit: Number.MAX_SAFE_INTEGER })).filter(([, value]) => value instanceof Uint8Array).length;

test("[FILES-1] a file names who put it: the agent, a viewer by the id the Store gives them on the page, or an anonymous viewer", async () => {
  const { target, url } = await sharedPage();
  const answers = [
    await put(target, 3),
    await ask(target, { url, subject: "bob", method: "agentpages/files/put", params: putting(4) }),
    await ask(target, { url, method: "agentpages/files/put", params: putting(5) }),
  ];

  expect(answers).toStrictEqual(
    [{ kind: "agent" }, { kind: "viewer", id: viewerId({ subject: "bob", pageId: PAGE }) }, { kind: "anonymous" }].map((updatedBy) => ({
      kind: "result",
      result: { file: expect.objectContaining({ id: "a", size: 3, updatedBy }) as unknown },
    })),
  );
});

test("[FILES-4] a deleted file leaves none of its bytes in the storage", async () => {
  const target = await withFile();
  const stored = await bytesIn(target.storage);
  await call(target, ["files_delete", { opId: op(3), pageId: PAGE, id: "a" }]);

  expect([stored, await bytesIn(target.storage)]).toStrictEqual([1, 0]);
});

test("[PAGES-14] a deleted page leaves none of the bytes of its files in the storage", async () => {
  const target = await withFile();
  await call(target, ["pages_delete", { opId: op(3), pageId: PAGE }]);

  expect(await bytesIn(target.storage)).toBe(0);
});

/** `storage`, whose transactions find an object where the Store put bytes. */
const withoutBytes = (storage: Storage): Storage =>
  transactingAs(storage, (tx) => ({
    getMany: async (keys) => (await tx.getMany(keys)).map((value) => (value instanceof Uint8Array ? {} : value)),
  }));

test("[REL-27] a file whose bytes the storage damaged is an Internal error", async () => {
  const target = await withFile();
  const broken = world({ ports: { storage: withoutBytes(target.storage) } });
  const read = await call(broken, ["files_get", { pageId: PAGE, id: "a" }]);

  expect(errorOf(read)).toBe("Internal");
  expect(broken.logs).toStrictEqual([expect.objectContaining({ error: "Internal", cause: "CorruptRecord", pageId: PAGE })]);
});

const MIB = 1_048_576;

/** A Store that takes files of up to `maxFileBytes`, with `PAGE`. */
const taking = async (maxFileBytes: number): Promise<World> => {
  const target = world({ config: { capability: { ...ADVERTISED, files: { maxFileBytes } } } });
  await call(target, PUBLISHED);
  return target;
};

/** A put of the file `a` with this blob, under `opId` number `n`. */
const putBlob = (target: World, [n, blob]: [number, string]): Promise<Answer> =>
  call(target, ["files_put", { pageId: PAGE, ...putting(n), blob }]);

/** The base64 of `count` bytes, which go through every byte value in turn. */
const blobOf = (count: number): string => Buffer.from(Uint8Array.from({ length: count }, (_, at) => at)).toString("base64");

test("[FILES-5] [FILES-7] a file of 4 MiB, the limit, is returned with every byte as it was put, and one byte more is LimitExceeded", async () => {
  const target = await taking(4 * MIB);
  const blob = blobOf(4 * MIB);
  const stored = resultOf(TOOL_SCHEMAS.files_put.result, await putBlob(target, [2, blob]));
  const read = resultOf(TOOL_SCHEMAS.files_get.result, await call(target, ["files_get", { pageId: PAGE, id: "a" }]));

  expect([stored.file.size, read.blob === blob, read.file]).toStrictEqual([4_194_304, true, stored.file]);
  expect(errorOf(await putBlob(target, [3, blobOf(4 * MIB + 1)]))).toBe("LimitExceeded");
  expect(await bytesIn(target.storage)).toBe(1);
});

test("[FILES-7] a blob of 30 MB for a Store that takes 1 KiB is LimitExceeded", async () => {
  const target = await taking(1024);
  const answer = await putBlob(target, [2, "A".repeat(40_000_000)]);

  expect(errorOf(answer)).toBe("LimitExceeded");
  expect(await bytesIn(target.storage)).toBe(0);
});

/** How much the Store has saved: the bytes of its bytes values, and the characters of its other values as JSON. */
const costOf = async (storage: Storage): Promise<number> =>
  (await storage.scan({ prefix: "", limit: Number.MAX_SAFE_INTEGER }))
    .map(([, value]) => (value instanceof Uint8Array ? value.length : JSON.stringify(value).length))
    .reduce((sum, cost) => sum + cost, 0);

test("[REL-2] what the Store saves for a put of n bytes, the request it remembers included, is n bytes and a small overhead", async () => {
  const target = await taking(MIB);
  const before = await costOf(target.storage);
  const first = await putBlob(target, [2, blobOf(MIB)]);
  const added = (await costOf(target.storage)) - before;

  expect(added).toBeGreaterThanOrEqual(MIB);
  expect(added).toBeLessThan(MIB + 1024);
  expect(await putBlob(target, [2, blobOf(MIB)])).toStrictEqual(first);
});

test("[REL-27] a request that throws while its params are read is an Internal error, logged with its cause", async () => {
  const target = world();
  const input = Object.defineProperty({}, "pageId", {
    enumerable: true,
    get: () => {
      throw new TypeError("The transport lost the params.");
    },
  });
  const answer = await call(target, ["files_get", input]);

  expect(errorOf(answer)).toBe("Internal");
  expect(target.logs).toStrictEqual([expect.objectContaining({ method: "files_get", error: "Internal", cause: "TypeError" })]);
});
