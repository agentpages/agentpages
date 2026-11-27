import type { Answer } from "@agentpages/protocol";
import type { Storage } from "@agentpages/storage";
import { expect, test } from "vitest";
import { ask, call, errorOf, op, PAGE, PUBLISHED, sharedPage, transactingAs, viewerId, world, type World } from "./support/store.ts";

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
