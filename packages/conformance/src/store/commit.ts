import type { Op } from "@agentpages/protocol";
import { type Cases, having, objectOfBytes, times } from "./kit.js";
import { after, COMMIT, COMMITS, committing, doc, limitsOf, listing, onBoth, onlyIf, put, remove, revisionsOf, seqOf, STATE_GET, STATE_LIST, stored, within } from "./surface.js";

/** As many puts, each of a document of its own. */
const puts = (count: number): Op[] => Array.from({ length: count }, (_, n) => put(`doc-${n}`, {}));

export const COMMIT_CASES: Cases = onBoth({
  "[STATE-9] commit applies all of its ops or none of them": async (acting) => {
    const { commit } = await acting.ok(COMMIT, committing([put("a", { n: 1 })]));
    const refused = await acting.answers(COMMIT, committing([put("b", {}), remove("a"), onlyIf(put("c", {}), 4)]));
    return {
      got: [refused, await acting.ok(STATE_LIST, listing()), await acting.ok(COMMITS, after(0))],
      want: [["Conflict", 2], { documents: [stored(commit, { id: "a", data: { n: 1 }, revision: 1 })], seq: 1 }, { commits: [commit], seq: 1 }],
    };
  },

  "[STATE-11] a put replaces the whole document": async (acting) => {
    const first = await acting.ok(COMMIT, committing([put("a", { kept: 1, dropped: { deep: true } })]));
    const before = await acting.ok(STATE_GET, doc("a"));
    const second = await acting.ok(COMMIT, committing([put("a", { kept: 2 })]));
    return {
      got: [before, await acting.ok(STATE_GET, doc("a"))],
      want: [
        { document: stored(first.commit, { id: "a", data: { kept: 1, dropped: { deep: true } }, revision: 1 }) },
        { document: stored(second.commit, { id: "a", data: { kept: 2 }, revision: 2 }) },
      ],
    };
  },

  "[STATE-12] a delete of a missing document changes nothing and produces no Change": async (acting) => {
    const { commit } = await acting.ok(COMMIT, committing([remove("b"), put("a", { n: 1 })]));
    return {
      got: [commit.changes.map((change) => change.id), await revisionsOf(acting, [put("b", {})]), await acting.ok(STATE_GET, doc("a"))],
      want: [["a"], [1], { document: stored(commit, { id: "a", data: { n: 1 }, revision: 1 }) }],
    };
  },

  "[STATE-13] a commit whose ops change nothing still succeeds and takes a seq": async (acting) => {
    const empty = await acting.ok(COMMIT, committing([]));
    const again = await acting.ok(COMMIT, committing([]));
    return {
      got: [empty.commit.seq, empty.commit.changes, again.commit.seq, await acting.ok(COMMITS, after(0))],
      want: [1, [], 2, { commits: [empty.commit, again.commit], seq: 2 }],
    };
  },

  "[STATE-23] the ops of a commit apply in the order given": async (acting) => {
    await acting.ok(COMMIT, committing([put("b", {}), put("c", {})]));
    const { commit } = await acting.ok(COMMIT, committing([put("c", {}), remove("b"), put("a", {}), within("notes", put("a", {}))]));
    return {
      got: commit.changes.map(({ collection, id, revision }) => [collection, id, revision]),
      want: [
        ["tasks", "c", 2],
        ["tasks", "b", 2],
        ["tasks", "a", 1],
        ["notes", "a", 1],
      ],
    };
  },

  "[STATE-14] a commit with more than maxOpsPerCommit ops, or with two ops on one document, is malformed": async (acting, driver) => {
    const { maxOpsPerCommit } = limitsOf(driver);
    const first = put("a", {});
    const tooMany = await acting.fails(COMMIT, committing(puts(maxOpsPerCommit + 1)));
    const twice = await acting.answers(COMMIT, committing([first, put("b", {}), first]));
    const apart = await revisionsOf(acting, [first, within("notes", first)]);
    const most = await acting.ok(COMMIT, committing(puts(maxOpsPerCommit)));
    return {
      got: [tooMany, twice, apart, most.commit.seq, most.commit.changes.length],
      want: ["InvalidParams", ["InvalidParams", 2], [1, 1], 2, maxOpsPerCommit],
    };
  },

  "[STATE-15] data larger than maxDocumentBytes, as UTF-8 JSON without whitespace, is beyond the limit": async (acting, driver) => {
    const { maxDocumentBytes } = limitsOf(driver);
    const tooLarge = await acting.answers(COMMIT, committing([put("a", {}), put("b", objectOfBytes(maxDocumentBytes + 1))]));
    const { commit } = await acting.ok(COMMIT, committing([put("a", objectOfBytes(maxDocumentBytes))]));
    return {
      got: [tooLarge, await acting.ok(STATE_LIST, listing())],
      want: [["LimitExceeded", 1], { documents: [stored(commit, { id: "a", data: objectOfBytes(maxDocumentBytes), revision: 1 })], seq: 1 }],
    };
  },

  "[STATE-16] a revision counter starts at 0, counts every put and every delete of a document, and never resets": async (acting) => {
    const counted = [
      await revisionsOf(acting, [put("a", {})]),
      await revisionsOf(acting, [put("b", {}), put("a", {})]),
      await revisionsOf(acting, [remove("a")]),
      await revisionsOf(acting, [remove("a"), put("b", {})]),
      await revisionsOf(acting, [put("a", {})]),
    ];
    const { documents } = await acting.ok(STATE_LIST, listing());
    return {
      got: [counted, documents.map((document) => [document.id, document.revision])],
      want: [
        [[1], [1, 2], [3], [2], [4]],
        [
          ["a", 4],
          ["b", 2],
        ],
      ],
    };
  },

  "[STATE-17] an op with ifRevision succeeds only if the counter equals it, and 0 asks that the document does not exist": async (acting) => {
    const tried = [
      await seqOf(acting, [onlyIf(put("a", {}), 0)]),
      await acting.answers(COMMIT, committing([put("b", {}), onlyIf(put("a", {}), 0)])),
      await acting.fails(COMMIT, committing([onlyIf(put("a", {}), 2)])),
      await seqOf(acting, [onlyIf(put("a", {}), 1)]),
      await acting.fails(COMMIT, committing([onlyIf(remove("a"), 1)])),
      await seqOf(acting, [onlyIf(remove("a"), 2)]),
      await acting.fails(COMMIT, committing([onlyIf(put("a", {}), 2)])),
      await acting.fails(COMMIT, committing([onlyIf(put("b", {}), 1)])),
      await revisionsOf(acting, [onlyIf(put("a", {}), 0), onlyIf(remove("b"), 0)]),
      await revisionsOf(acting, [onlyIf(put("a", {}), 4)]),
    ];
    return { got: tried, want: [1, ["Conflict", 1], "Conflict", 2, "Conflict", 3, "Conflict", "Conflict", [4], [5]] };
  },

  "[REL-2] a commit repeated with its opId is applied once and gets the first commit again": async (acting) => {
    const params = committing([put("a", {})]);
    const first = await acting.ok(COMMIT, params);
    const second = await acting.ok(COMMIT, committing([put("a", { n: 2 })]));
    const copies = await Promise.all([acting.ok(COMMIT, params), acting.ok(COMMIT, params)]);
    return {
      got: [copies, first.commit.seq, await acting.ok(STATE_LIST, listing())],
      want: [[first, first], 1, { documents: [stored(second.commit, { id: "a", data: { n: 2 }, revision: 2 })], seq: 2 }],
    };
  },

  "[REL-3] the opId of a commit used again with other params is malformed": async (acting) => {
    const [params, swapped, none] = [committing([put("a", { x: 1, y: [1, 2] })]), committing([put("a", { x: 1, y: [2, 1] })]), committing([])];
    const first = await acting.ok(COMMIT, params);
    const others = await Promise.all([swapped, none].map((other) => acting.fails(COMMIT, having(other, ["opId", params.opId]))));
    const reordered = await acting.ok(COMMIT, { ...params, ops: [put("a", { y: [1, 2], x: 1 })] });
    const second = await acting.ok(COMMIT, swapped);
    return {
      got: [others, reordered, await seqOf(acting, none.ops), await acting.ok(STATE_GET, doc("a"))],
      want: [times(2, "InvalidParams"), first, 3, { document: stored(second.commit, { id: "a", data: { x: 1, y: [2, 1] }, revision: 2 }) }],
    };
  },

  "[REL-30] a repeated commit gets its first commit, and an opId used again with other ops is decided after the limits": async (acting, driver) => {
    const params = committing([]);
    const tooLarge = put("a", objectOfBytes(limitsOf(driver).maxDocumentBytes + 1));
    const first = await acting.ok(COMMIT, params);
    return {
      got: [
        await acting.ok(COMMIT, params),
        await acting.answers(COMMIT, having(params, ["ops", [tooLarge]])),
        await acting.answers(COMMIT, having(params, ["ops", puts(1)])),
        await acting.ok(COMMITS, after(0)),
      ],
      want: [first, ["LimitExceeded", 0], ["InvalidParams", undefined], { commits: [first.commit], seq: 1 }],
    };
  },

  "[REL-31] a commit that failed is not remembered": async (acting) => {
    const params = committing([onlyIf(put("a", {}), 1)]);
    const refused = await acting.fails(COMMIT, params);
    await acting.ok(COMMIT, committing([put("a", {})]));
    const { commit } = await acting.ok(COMMIT, params);
    return {
      got: [refused, commit.seq, commit.changes.map((change) => change.revision)],
      want: ["Conflict", 2, [2]],
    };
  },
});
