import type { Answer } from "@agentpages/protocol";
import { expect, test } from "vitest";
import { comment, REPLY, resolved, savedText, startElsewhere, THREAD, threadCounts, threadOf, withThread } from "./support/comments.ts";
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

test("the Store counts every start, reply and resolve of the threads of a page, and nothing else, for that page alone", async () => {
  const { target } = await withThread();
  const counted = [await call(target, REPLY), await call(target, resolved(5)), await call(target, resolved(6))];
  const uncounted = [await call(target, REPLY), await call(target, ["comments_resolve", { opId: op(7), pageId: PAGE, threadId: op(8) }])];
  const elsewhere = await startElsewhere(target);

  expect([...counted, elsewhere].map((answer) => answer.kind)).toStrictEqual(["result", "result", "result", "result"]);
  expect(uncounted.map((answer) => errorOf(answer))).toStrictEqual([undefined, "NotFound"]);
  expect(await threadCounts(target.storage)).toStrictEqual([4, 1]);
});

test("[PAGES-14] pages_delete leaves nothing of the threads of a page, and the threads of another page stay", async () => {
  const { target } = await withThread();
  await call(target, REPLY);
  await startElsewhere(target);
  const before = await savedText(target.storage);
  await call(target, ["pages_delete", { opId: op(11), pageId: PAGE }]);
  const after = await savedText(target.storage);

  expect([before.includes("First"), before.includes("Second"), after.includes("First"), after.includes("Second")]).toStrictEqual([true, true, false, false]);
  expect([after.includes("Elsewhere"), await threadCounts(target.storage)]).toStrictEqual([true, [1]]);
});
