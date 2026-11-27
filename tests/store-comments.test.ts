import type { Answer } from "@agentpages/protocol";
import { expect, test } from "vitest";
import { comment, heads, REPLY, resolved, THREAD, threadOf, withThread } from "./support/comments.ts";
import { rowsOfDeleted, savedRows } from "./support/results.ts";
import { call, errorOf, op, PAGE, saved, viewerId } from "./support/store.ts";

interface Lost {
  /** What the reply answers and leaves in the storage when nothing goes wrong. */
  expected: { answer: Answer; effect: unknown };
  /** What the storage held before the reply. */
  before: unknown;
  lost: Answer;
  /** What the storage held when the reply was answered. */
  afterCrash: unknown;
  repeats: Answer[];
  /** What the storage holds in the end. */
  effect: unknown;
}

/** Sends the reply to a Store whose storage crashes at `point`, restarts the Store, and sends the reply twice more. */
const replyLostAt = async (point: "commit" | "committed"): Promise<Lost> => {
  const [undisturbed, { target }] = [await withThread(), await withThread()];
  const answer = await call(undisturbed.target, REPLY);
  const before = await saved(target.storage);
  target.failAt(point);
  const lost = await call(target, REPLY);
  const afterCrash = await saved(target.storage);
  target.restart();
  const repeats = [await call(target, REPLY), await call(target, REPLY)];
  return { expected: { answer, effect: await saved(undisturbed.target.storage) }, before, lost, afterCrash, repeats, effect: await saved(target.storage) };
};

test("[REL-7] comments_reply that fails at commit leaves no entry, count or op record, and its repeat is applied once", async () => {
  const { expected, before, lost, afterCrash, repeats, effect } = await replyLostAt("commit");

  expect(errorOf(lost)).toBe("Unavailable");
  expect(afterCrash).toStrictEqual(before);
  expect(repeats).toStrictEqual([expected.answer, expected.answer]);
  expect(effect).toStrictEqual(expected.effect);
  expect(effect).not.toStrictEqual(before);
});

test("[REL-2] comments_reply whose answer is lost at committed returns the same thread on retry", async () => {
  const { expected, lost, afterCrash, repeats, effect } = await replyLostAt("committed");

  expect(errorOf(lost)).toBe("Unavailable");
  expect(afterCrash).toStrictEqual(expected.effect);
  expect(repeats).toStrictEqual([expected.answer, expected.answer]);
  expect(effect).toStrictEqual(expected.effect);
  expect(threadOf(expected.answer).entries.map((entry) => entry.body)).toStrictEqual(["First", "Second"]);
});

test("[HOST-6] the author of an entry is the viewer under the id they have on the page, and nobody for an agent", async () => {
  const { target, url } = await withThread();
  await call(target, REPLY);
  const answered = await comment(target, { operation: "comments_reply", subject: "carol", name: "Carol", input: { opId: op(5), url, threadId: THREAD, body: "Third" } });

  expect(threadOf(answered).entries.map((entry) => entry.author)).toStrictEqual([
    { id: viewerId({ subject: "bob", pageId: PAGE }) },
    null,
    { id: viewerId({ subject: "carol", pageId: PAGE }), name: "Carol" },
  ]);
});

test("[HOST-7] pages_heads makes one read of four rows for a signed-in viewer and of three for an anonymous one, under no lock, and none for a url of another origin", async () => {
  const { target, url } = await withThread();
  const reached: unknown[] = [];
  target.plan((point, { keys, locks }) => reached.push([point, keys.length, locks.length]));
  const answers = [await comment(target, { operation: "pages_heads", subject: "bob", input: { url } }), await heads(target, url)];
  const nowhere = await heads(target, "https://elsewhere.test/p/page");

  expect([...answers.map((answer) => answer.kind), errorOf(nowhere)]).toStrictEqual(["result", "result", "NotFound"]);
  expect(target.logs.slice(-3).map((record) => [record.method, record.pageId])).toStrictEqual([["pages_heads", PAGE], ["pages_heads", PAGE], ["pages_heads", undefined]]);
  expect(reached).toStrictEqual([["getMany", 4, 0], ["commit", 0, 0], ["committed", 0, 0], ["getMany", 3, 0], ["commit", 0, 0], ["committed", 0, 0]]);
});

test("[PAGES-14] pages_delete leaves nothing of the threads of a page but the record that the page is gone", async () => {
  const { target } = await withThread();
  await call(target, REPLY).then(() => call(target, resolved(5)));
  await call(target, ["pages_delete", { opId: op(11), pageId: PAGE }]);

  expect(await savedRows(target.storage)).toStrictEqual(rowsOfDeleted({ pageId: PAGE, opId: op(11) }));
});

test("[REL-2] what the Store remembers of a start, a reply and a resolve does not hold the entries: each body is saved once", async () => {
  const { target } = await withThread();
  await call(target, REPLY).then(() => call(target, resolved(5)));
  const text = JSON.stringify(await saved(target.storage));
  const repeated = threadOf(await call(target, REPLY));

  expect([text.split("First").length, text.split("Second").length]).toStrictEqual([2, 2]);
  expect([repeated.status, repeated.entries.map((entry) => entry.body)]).toStrictEqual(["open", ["First", "Second"]]);
});
