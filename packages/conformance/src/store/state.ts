import { COMMIT_CASES } from "./commit.js";
import { type Cases, having, inPagesOfTwo, inTurn, ofLength, pageId, text, tick, timeOf, times } from "./kit.js";
import { MODEL_CASES } from "./model.js";
import { SCOPE_CASES } from "./scopes.js";
import { type ActingCases, after, COMMIT, COMMITS, committing, doc, listing, onBoth, onlyIf, put, remove, seqsAfter, STATE_GET, STATE_LIST, stored, type Surface, within } from "./surface.js";

const MS_PER_SECOND = 1000;

/** A commit for each number, each of one new document. */
const commitEach = (surface: Surface, numbers: number[]): Promise<unknown> =>
  inTurn(numbers, (n) => surface.ok(COMMIT, committing([put(`doc-${n}`, {})])));

const numbersTo = (count: number): number[] => Array.from({ length: count }, (_, n) => n);

const ON_BOTH: ActingCases = {
  "[STATE-1] get returns the document, or null where there is none": async (acting) => {
    const { commit } = await acting.ok(COMMIT, committing([put("a", { title: "Plan", nested: { list: [1, null] } })]));
    return {
      got: [await acting.ok(STATE_GET, doc("a")), await acting.ok(STATE_GET, doc("b")), await acting.ok(STATE_GET, within("notes", doc("a")))],
      want: [
        {
          document: {
            collection: "tasks",
            id: "a",
            data: { title: "Plan", nested: { list: [1, null] } },
            revision: 1,
            updatedAt: commit.at,
            updatedBy: acting.by,
          },
        },
        { document: null },
        { document: null },
      ],
    };
  },

  "[STATE-2] list returns the documents of a collection, and the seq of the log": async (acting) => {
    const first = await acting.ok(COMMIT, committing([put("a", { n: 1 }), within("notes", put("a", { n: 2 }))]));
    const second = await acting.ok(COMMIT, committing([put("b", { n: 3 })]));
    return {
      got: [
        await acting.ok(STATE_LIST, listing()),
        await acting.ok(STATE_LIST, within("notes", listing())),
        await acting.ok(STATE_LIST, within("none", listing())),
      ],
      want: [
        { documents: [stored(first.commit, { id: "a", data: { n: 1 }, revision: 1 }), stored(second.commit, { id: "b", data: { n: 3 }, revision: 1 })], seq: 2 },
        { documents: [within("notes", stored(first.commit, { id: "a", data: { n: 2 }, revision: 1 }))], seq: 2 },
        { documents: [], seq: 2 },
      ],
    };
  },

  "[STATE-3] commit applies its ops and returns the commit": async (acting, driver) => {
    const params = committing([put("a", { n: 1 }), put("b", { n: 2 })]);
    const { commit } = await acting.ok(COMMIT, params);
    tick(driver);
    const later = await acting.ok(COMMIT, committing([remove("a")]));
    return {
      got: [commit, later.commit, timeOf(later.commit.at) - timeOf(commit.at), await acting.ok(STATE_LIST, listing())],
      want: [
        {
          seq: 1,
          opId: params.opId,
          at: commit.at,
          by: acting.by,
          changes: [
            { collection: "tasks", id: "a", revision: 1, document: { collection: "tasks", id: "a", data: { n: 1 }, revision: 1, updatedAt: commit.at, updatedBy: acting.by } },
            { collection: "tasks", id: "b", revision: 1, document: { collection: "tasks", id: "b", data: { n: 2 }, revision: 1, updatedAt: commit.at, updatedBy: acting.by } },
          ],
        },
        { seq: 2, opId: later.commit.opId, at: later.commit.at, by: acting.by, changes: [{ collection: "tasks", id: "a", revision: 2, document: null }] },
        1000,
        { documents: [stored(commit, { id: "b", data: { n: 2 }, revision: 1 })], seq: 2 },
      ],
    };
  },

  "[STATE-4] commits returns the commits after since, and the current seq": async (acting) => {
    const first = await acting.ok(COMMIT, committing([]));
    const second = await acting.ok(COMMIT, committing([]));
    return {
      got: [await acting.ok(COMMITS, after(0)), await acting.ok(COMMITS, after(1)), await acting.ok(COMMITS, after(2))],
      want: [
        { commits: [first.commit, second.commit], seq: 2 },
        { commits: [second.commit], seq: 2 },
        { commits: [], seq: 2 },
      ],
    };
  },

  "[STATE-18] list orders by id, ascending by code point, and its seq is the position of the log": async (acting) => {
    await acting.ok(COMMIT, committing(["b", "B", "a_1", "a-1", "10", "9"].map((id) => put(id, {}))));
    await acting.ok(COMMIT, committing([within("notes", put("0", {}))]));
    const pages = await inPagesOfTwo((paging) => acting.ok(STATE_LIST, { ...listing(), ...paging }));
    const elsewhere = await acting.ok(STATE_LIST, within("notes", listing()));
    return {
      got: [
        pages.map((listed) => listed.documents.map((document) => document.id)),
        pages.map((listed) => Object.keys(listed).length),
        pages.map((listed) => listed.seq),
        elsewhere.documents.map((document) => document.id),
      ],
      want: [
        [
          ["10", "9"],
          ["B", "a-1"],
          ["a_1", "b"],
        ],
        [3, 3, 2],
        [2, 2, 2],
        ["0"],
      ],
    };
  },

  "[STATE-19] commits returns up to limit commits after since, in order, and a since beyond the seq is malformed": async (acting) => {
    await commitEach(acting, [1, 2, 3]);
    return {
      got: [
        await seqsAfter(acting, { ...after(0), limit: 2 }),
        await seqsAfter(acting, { ...after(2), limit: 2 }),
        await seqsAfter(acting, after(1)),
        await acting.ok(COMMITS, after(3)),
        await acting.fails(COMMITS, after(4)),
      ],
      want: [[1, 2], [3], [2, 3], { commits: [], seq: 3 }, "InvalidParams"],
    };
  },

  "[COMMON-4] list and commits without a limit return 100 items": async (acting) => {
    await commitEach(acting, numbersTo(101));
    const listed = await acting.ok(STATE_LIST, listing());
    const rest = await acting.ok(STATE_LIST, { ...listing(), cursor: listed.nextCursor });
    const followed = await acting.ok(COMMITS, after(0));
    return {
      got: [listed.documents.length, rest.documents.map((document) => document.id), Object.keys(rest), followed.commits.length, followed.seq],
      want: [100, ["doc-99"], ["documents", "seq"], 100, 101],
    };
  },

  "[STATE-20] commits are kept for commitRetentionSeconds, and a since older than that must resync": async (acting, driver) => {
    const { commit } = await acting.ok(COMMIT, committing([]));
    driver.advance(driver.capability.limits.commitRetentionSeconds * MS_PER_SECOND);
    const kept = await acting.ok(COMMITS, after(0));
    const fresh = await acting.ok(COMMIT, committing([]));
    driver.advance(1);
    return {
      got: [kept, await acting.fails(COMMITS, after(0)), await acting.ok(COMMITS, after(1)), await acting.ok(COMMITS, after(2))],
      want: [{ commits: [commit], seq: 1 }, "ResyncRequired", { commits: [fresh.commit], seq: 2 }, { commits: [], seq: 2 }],
    };
  },

  "[COMMON-9] a state request whose values break a rule of section 2.1 is malformed": async (acting) => {
    const [read, listed, followed, first, none] = [doc("a"), listing(), after(0), put("a", {}), committing([])];
    const broken = await Promise.all([
      acting.fails(STATE_GET, having(read, ["collection", text(1)])),
      acting.fails(STATE_GET, having(read, ["id", ofLength(129)])),
      acting.fails(STATE_LIST, having(listed, ["scope", text(1)])),
      acting.fails(STATE_LIST, having(listed, ["limit", 0])),
      acting.fails(COMMITS, having(followed, ["since", 1.5])),
      acting.fails(COMMITS, having(followed, ["limit", 101])),
      acting.fails(COMMIT, having(none, ["opId", pageId(1).slice(1)])),
      acting.answers(COMMIT, committing([first, onlyIf(first, 1.5)])),
    ]);
    const made = await acting.ok(COMMIT, none);
    return {
      got: [broken, await acting.ok(STATE_GET, doc(ofLength(128))), await acting.ok(STATE_GET, read), await acting.ok(STATE_LIST, listed), await acting.ok(COMMITS, followed)],
      want: [[...times(7, "InvalidParams"), ["InvalidParams", 1]], { document: null }, { document: null }, { documents: [], seq: 1 }, { commits: [made.commit], seq: 1 }],
    };
  },
};

export const STATE_CASES: Cases = { ...onBoth(ON_BOTH), ...COMMIT_CASES, ...SCOPE_CASES, ...MODEL_CASES };
