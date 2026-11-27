import type { Change, JsonObject, Op, PageContent } from "@agentpages/protocol";
import type { Driver } from "../contract.js";
import { actingAs, agent, type Cases, collection, having, LINK_READ, objectOfBytes, ofLength, page, PUBLISH, type Session, SET_ACCESS, sharing, text, type, TYPE_PUBLISH, typed, viewer } from "./kit.js";
import { type ActingCases, after, COMMIT, COMMITS, committing, doc, limitsOf, listing, mine, onBoth, onlyIf, put, remove, revisionsOf, STATE_GET, STATE_LIST, type Surface, toolsOf, viewOf, within } from "./surface.js";

const tree = { ...collection({}), tree: true };

/** Publishes the first version of type `n`, whose `tasks` and `notes` are trees and whose `labels` are not. */
const ofTrees = async (alice: Session, n: number): Promise<PageContent> => {
  await alice.ok(TYPE_PUBLISH, having(type(n, 0), ["collections", { tasks: tree, notes: tree, labels: collection({}) }]));
  return typed(n, 1);
};

/** The data of a tree document: its parent and its index, whatever they are. */
const place = (parent: unknown, index: unknown = "a"): JsonObject => ({ parent, index });

/** A put of a task under a parent, or as a root. */
const node = (id: string, parent: string | null): Op => put(id, place(parent));

/** `op`, a put, with other data. */
const holding = (op: Op, data: JsonObject): unknown => having(op, ["data", data]);

/** An index that ends in zero, which none may. */
const ZERO = String(0);

/** The ids of the documents a commit of these ops changes, in the order of its changes. */
const changedBy = async (surface: Surface, ops: readonly unknown[]): Promise<string[]> =>
  (await surface.ok(COMMIT, committing(ops))).commit.changes.map((change) => change.id);

/** The ids of the documents a list returns. */
const idsIn = async (surface: Surface, params: unknown): Promise<string[]> =>
  (await surface.ok(STATE_LIST, params)).documents.map((document) => document.id);

/** The change that deletes a task whose counter was 1. */
const gone = (id: string): Change => ({ collection: "tasks", id, revision: 2, document: null });

const VALID = ["1", "Z", "a", "0a", "a0b", "00009"];

/** No index: empty, zero, ending in zero, with other characters than letters and digits, and no text. */
const INVALID = [ofLength(0), ZERO, ofLength(1).concat(ZERO), text(1), 7];

const ON_BOTH: ActingCases = {
  "[TREE-1] the documents with parent null are roots, and a parent is a document of the same collection": async (acting) => {
    const child = node("c", "a");
    const grown = await revisionsOf(acting, [node("a", null), node("b", "a"), within("notes", node("b", null))]);
    const refused = [
      await acting.answers(COMMIT, committing([within("notes", child)])),
      await acting.answers(COMMIT, committing([holding(child, place(7))])),
      await acting.answers(COMMIT, committing([node("d", null), holding(child, place(text(1)))])),
    ];
    const same = await revisionsOf(acting, [within("notes", node("c", "b")), child]);
    return {
      got: [grown, refused, same, await idsIn(acting, listing()), await idsIn(acting, within("notes", listing()))],
      want: [
        [1, 1, 1],
        [
          ["Conflict", 0],
          ["InvalidParams", 0],
          ["InvalidParams", 1],
        ],
        [1, 1],
        ["a", "b", "c"],
        ["b", "c"],
      ],
    };
  },

  "[TREE-2] in a tree, an index that does not match the pattern is malformed": async (acting) => {
    const [first, second] = [node("a", null), node("b", null)];
    const taken = await revisionsOf(acting, VALID.map((index, n) => put(`valid-${n}`, place(null, index))));
    const refused = await Promise.all(INVALID.map((index) => acting.answers(COMMIT, committing([first, holding(second, place(null, index))]))));
    const elsewhere = await revisionsOf(acting, [first, holding(within("labels", second), place(null, ZERO))]);
    return {
      got: [taken, refused, elsewhere, await revisionsOf(acting, [second]), await idsIn(acting, listing())],
      want: [
        [1, 1, 1, 1, 1, 1],
        [
          ["InvalidParams", 1],
          ["InvalidParams", 1],
          ["InvalidParams", 1],
          ["InvalidParams", 1],
          ["InvalidParams", 1],
        ],
        [1, 1],
        [1],
        ["a", "b", "valid-0", "valid-1", "valid-2", "valid-3", "valid-4", "valid-5"],
      ],
    };
  },

  "[COMMON-5] what is no tree node is decided after the limits and before a conflict, and a broken tree after the conditions of the ops": async (acting, driver) => {
    const [first, second] = [node("a", null), node("b", null)];
    const tried = [
      [holding(first, place(null, ZERO)), put("c", objectOfBytes(limitsOf(driver).maxDocumentBytes + 1))],
      [onlyIf(first, 1), holding(second, place(null, ZERO))],
      [node("a", "none"), onlyIf(second, 1)],
      [node("a", "none"), second],
    ];
    const refused = await Promise.all(tried.map((ops) => acting.answers(COMMIT, committing(ops))));
    return {
      got: [refused, await revisionsOf(acting, [first, second])],
      want: [
        [
          ["LimitExceeded", 1],
          ["InvalidParams", 1],
          ["Conflict", 1],
          ["Conflict", 0],
        ],
        [1, 1],
      ],
    };
  },

  "[TREE-4] a commit that would leave a tree document with a missing parent, or would create a cycle, is a conflict": async (acting) => {
    await acting.ok(COMMIT, committing([node("a", null), node("b", "a"), node("c", "b")]));
    const before = await acting.ok(STATE_LIST, listing());
    const refused = [
      await acting.answers(COMMIT, committing([node("d", "none")])),
      await acting.answers(COMMIT, committing([node("d", "b"), node("b", "none")])),
      await acting.answers(COMMIT, committing([node("a", "a")])),
      await acting.answers(COMMIT, committing([node("b", "c")])),
      await acting.answers(COMMIT, committing([node("e", null), node("a", "c")])),
      await acting.answers(COMMIT, committing([node("d", "e"), node("e", "d")])),
      await acting.answers(COMMIT, committing([node("f", "g"), node("g", "d"), node("d", "e"), node("e", "d")])),
    ];
    const unchanged = await acting.ok(STATE_LIST, listing());
    return {
      got: [refused, unchanged, await revisionsOf(acting, [node("c", "a"), node("b", "c")]), await acting.answers(COMMIT, committing([node("c", "b")]))],
      want: [
        [
          ["Conflict", 0],
          ["Conflict", 1],
          ["Conflict", 0],
          ["Conflict", 0],
          ["Conflict", 1],
          ["Conflict", 0],
          ["Conflict", 2],
        ],
        before,
        [2, 2],
        ["Conflict", 0],
      ],
    };
  },

  "[TREE-5] deleting a tree document also deletes all its descendants in the same commit, each as a Change": async (acting) => {
    await acting.ok(COMMIT, committing([node("a", null), node("b", "a"), node("c", "a"), node("d", "b"), node("e", null)]));
    await acting.ok(COMMIT, committing([within("notes", node("a", null)), within("notes", node("b", "a")), within("labels", put("a", {}))]));
    const { commit } = await acting.ok(COMMIT, committing([remove("a")]));
    return {
      got: [
        commit.changes,
        await idsIn(acting, listing()),
        await idsIn(acting, within("notes", listing())),
        await idsIn(acting, within("labels", listing())),
        await acting.ok(STATE_GET, doc("d")),
        await acting.ok(COMMITS, after(2)),
        await changedBy(acting, [remove("a"), node("f", null)]),
        await revisionsOf(acting, [node("d", null), node("a", "d")]),
        await changedBy(acting, [remove("a")]),
      ],
      want: [[gone("a"), gone("b"), gone("d"), gone("c")], ["e"], ["a", "b"], ["a"], { document: null }, { commits: [commit], seq: 3 }, ["f"], [3, 3], ["a"]],
    };
  },

  "[TREE-5] a document the commit moves out of a deleted document stays, and one it puts under a deleted document has a missing parent": async (acting) => {
    const built = await acting.ok(COMMIT, committing([node("a", null), node("b", "a"), node("c", "a"), node("d", "b")]));
    const refused = [
      await acting.answers(COMMIT, committing([remove("a"), node("x", "a")])),
      await acting.answers(COMMIT, committing([node("x", "a"), remove("a")])),
      await acting.answers(COMMIT, committing([remove("a"), node("x", "d")])),
      await acting.answers(COMMIT, committing([remove("a"), node("b", "a")])),
      await acting.answers(COMMIT, committing([remove("a"), node("d", "c")])),
    ];
    const kept = await acting.ok(STATE_LIST, listing());
    return {
      got: [refused, kept.documents.length, await changedBy(acting, [remove("a"), node("b", null)]), await idsIn(acting, listing()), await acting.ok(STATE_GET, doc("d"))],
      want: [
        [
          ["Conflict", 1],
          ["Conflict", 0],
          ["Conflict", 1],
          ["Conflict", 1],
          ["Conflict", 1],
        ],
        4,
        ["a", "c", "b"],
        ["b", "d"],
        { document: { collection: "tasks", id: "d", data: { parent: "b", index: "a" }, revision: 1, updatedAt: built.commit.at, updatedBy: acting.by } },
      ],
    };
  },

  "[TREE-6] the tree rules are checked once, after all the ops of a commit": async (acting) => {
    return {
      got: [
        await revisionsOf(acting, [node("b", "a"), node("a", null)]),
        await revisionsOf(acting, [node("a", "b"), node("b", null)]),
        await changedBy(acting, [node("c", "a"), remove("b"), node("a", null)]),
        await idsIn(acting, listing()),
      ],
      want: [
        [1, 1],
        [2, 2],
        ["c", "b", "a"],
        ["a", "c"],
      ],
    };
  },

  "[TREE-7] changes are in op order: a delete is followed by its descendants, a parent before its children, siblings by id": async (acting) => {
    await acting.ok(COMMIT, committing([node("r", null), node("a", "r"), node("B", "r"), node("10", "r"), node("x", "B")]));
    await acting.ok(COMMIT, committing([node("p", null), node("q", "p"), node("u", "q"), node("k", "p")]));
    return {
      got: [await changedBy(acting, [node("n", null), remove("r")]), await changedBy(acting, [remove("p"), node("m", null), remove("q")]), await idsIn(acting, listing())],
      want: [
        ["n", "r", "10", "B", "x", "a"],
        ["p", "k", "m", "q", "u"],
        ["m", "n"],
      ],
    };
  },

  "[TREE-8] a commit whose changes, descendants included, number more than maxOpsPerCommit is beyond the limit, after the other tree rules": async (acting, driver) => {
    const { maxOpsPerCommit } = limitsOf(driver);
    const children = Array.from({ length: maxOpsPerCommit - 1 }, (_, n) => node(`child-${n}`, "p"));
    await acting.ok(COMMIT, committing([node("p", null), ...children]));
    const refused = [
      await acting.answers(COMMIT, committing([remove("p"), node("q", null)])),
      await acting.answers(COMMIT, committing([remove("p"), node("q", null), node("x", "none")])),
    ];
    const kept = await idsIn(acting, listing());
    const { commit } = await acting.ok(COMMIT, committing([remove("p")]));
    return {
      got: [refused, kept.length, commit.changes.length, commit.seq, await idsIn(acting, listing())],
      want: [
        [
          ["LimitExceeded", undefined],
          ["Conflict", 2],
        ],
        maxOpsPerCommit,
        maxOpsPerCommit,
        2,
        [],
      ],
    };
  },
};

const EACH: Cases = {
  "[TREE-1] the tree rules hold in the page scope: a viewer's own scope holds whatever its viewer puts there": async (driver: Driver) => {
    const alice = actingAs(driver, agent(1));
    await alice.ok(PUBLISH, having(page(1, 0), ["content", await ofTrees(alice, 1)]));
    const bob = viewOf(driver, viewer(2, (await alice.ok(SET_ACCESS, sharing(1, LINK_READ))).url));
    const [owner, orphan, unindexed] = [toolsOf(driver, { by: 1, on: 1 }), node("b", "a"), holding(node("c", null), place(null, ZERO))];
    const refused = [await owner.answers(COMMIT, committing([orphan])), await owner.answers(COMMIT, committing([unindexed]))];
    const own = await bob.ok(COMMIT, mine(committing([orphan, unindexed])));
    const grown = await bob.ok(COMMIT, mine(committing([node("a", null)])));
    const deleted = await bob.ok(COMMIT, mine(committing([remove("a")])));
    return {
      got: [refused, own.commit.seq, grown.commit.seq, deleted.commit.changes.map((change) => change.id), await idsIn(bob, mine(listing()))],
      want: [
        [
          ["Conflict", 0],
          ["InvalidParams", 0],
        ],
        1,
        2,
        ["a"],
        ["b", "c"],
      ],
    };
  },
};

export const TREE_CASES: Cases = { ...onBoth(ON_BOTH, ofTrees), ...EACH };
