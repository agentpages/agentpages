import { anonymous, type Cases, DELETE, deleting, having, LINK_READ, LINK_WRITE, objectOfBytes, text, times, viewer } from "./kit.js";
import { actorOf, after, COMMIT, COMMITS, committing, doc, limitsOf, listing, mine, onlyIf, put, seqOf, seqsAfter, shared, STATE_GET, STATE_LIST, stored, toolsOf, viewOf } from "./surface.js";

export const SCOPE_CASES: Cases = {
  "[STATE-5] page scope documents are shared by every viewer of the page, and with its agent": async (driver) => {
    const { url } = await shared(driver, LINK_WRITE);
    const [owner, bob, nobody] = [toolsOf(driver, { by: 1, on: 1 }), viewOf(driver, viewer(2, url)), viewOf(driver, anonymous(url))];
    const first = await owner.ok(COMMIT, committing([put("a", { n: 1 })]));
    const second = await bob.ok(COMMIT, committing([put("b", { n: 2 })]));
    const third = await nobody.ok(COMMIT, committing([put("c", { n: 3 })]));
    const everything = {
      documents: [
        stored(first.commit, { id: "a", data: { n: 1 }, revision: 1 }),
        stored(second.commit, { id: "b", data: { n: 2 }, revision: 1 }),
        stored(third.commit, { id: "c", data: { n: 3 }, revision: 1 }),
      ],
      seq: 3,
    };
    return {
      got: [
        await owner.ok(STATE_LIST, listing()),
        await bob.ok(STATE_LIST, listing()),
        await nobody.ok(STATE_LIST, listing()),
        await viewOf(driver, viewer(3, url)).ok(STATE_LIST, listing()),
      ],
      want: [everything, everything, everything, everything],
    };
  },

  "[STATE-6] viewer scope documents are private to their viewer": async (driver) => {
    const { url } = await shared(driver, LINK_READ);
    const [alice, bob, carol] = [viewOf(driver, viewer(1, url)), viewOf(driver, viewer(2, url)), viewOf(driver, viewer(3, url))];
    const bobs = await bob.ok(COMMIT, mine(committing([put("a", { of: "bob" })])));
    const carols = await carol.ok(COMMIT, mine(committing([put("a", { of: "carol" }), put("b", {})])));
    return {
      got: [
        await bob.ok(STATE_GET, mine(doc("a"))),
        await carol.ok(STATE_GET, mine(doc("a"))),
        await alice.ok(STATE_GET, mine(doc("a"))),
        await alice.ok(STATE_LIST, listing()),
        (await bob.ok(STATE_LIST, mine(listing()))).documents.map((document) => document.id),
        await alice.ok(COMMITS, mine(after(0))),
      ],
      want: [
        { document: stored(bobs.commit, { id: "a", data: { of: "bob" }, revision: 1 }) },
        { document: stored(carols.commit, { id: "a", data: { of: "carol" }, revision: 1 }) },
        { document: null },
        { documents: [], seq: 0 },
        ["a"],
        { commits: [], seq: 0 },
      ],
    };
  },

  "[STATE-7] viewer scope with an anonymous viewer is unauthenticated": async (driver) => {
    const { url } = await shared(driver, LINK_WRITE);
    const nobody = viewOf(driver, anonymous(url));
    const refused = await Promise.all([
      nobody.fails(STATE_GET, mine(doc("a"))),
      nobody.fails(STATE_LIST, mine(listing())),
      nobody.fails(COMMIT, mine(committing([]))),
      nobody.fails(COMMITS, mine(after(0))),
    ]);
    return { got: [refused, await nobody.ok(COMMITS, after(0))], want: [times(4, "Unauthenticated"), { commits: [], seq: 0 }] };
  },

  "[STATE-8] by and updatedBy name who made the change": async (driver) => {
    const { url } = await shared(driver, LINK_WRITE);
    const [owner, bob, nobody] = [toolsOf(driver, { by: 1, on: 1 }), viewOf(driver, viewer(2, url)), viewOf(driver, anonymous(url))];
    await owner.ok(COMMIT, committing([put("a", {})]));
    await bob.ok(COMMIT, committing([put("b", {})]));
    await nobody.ok(COMMIT, committing([put("c", {})]));
    const own = await bob.ok(COMMIT, mine(committing([])));
    const { commits } = await owner.ok(COMMITS, after(0));
    const { documents } = await owner.ok(STATE_LIST, listing());
    const whoBobIs = await actorOf(driver, viewer(2, url));
    return {
      got: [commits.map((commit) => commit.by), documents.map((document) => document.updatedBy), own.commit.by, whoBobIs.kind],
      want: [[{ kind: "agent" }, whoBobIs, { kind: "anonymous" }], [{ kind: "agent" }, whoBobIs, { kind: "anonymous" }], whoBobIs, "viewer"],
    };
  },

  "[STATE-10] the page scope and each viewer's scope have a log of their own, numbered from 1 without gaps": async (driver) => {
    const { url } = await shared(driver, LINK_WRITE);
    const [bob, carol] = [viewOf(driver, viewer(2, url)), viewOf(driver, viewer(3, url))];
    const taken = [
      await seqOf(bob, []),
      (await bob.ok(COMMIT, mine(committing([])))).commit.seq,
      (await carol.ok(COMMIT, mine(committing([])))).commit.seq,
      await carol.fails(COMMIT, mine(committing([onlyIf(put("a", {}), 2)]))),
      (await carol.ok(COMMIT, mine(committing([])))).commit.seq,
      await seqOf(carol, []),
      await seqOf(bob, []),
    ];
    return {
      got: [taken, await seqsAfter(bob, after(0)), await seqsAfter(bob, mine(after(0))), await seqsAfter(carol, mine(after(0)))],
      want: [[1, 1, 1, "Conflict", 2, 2, 3], [1, 2, 3], [1], [1, 2]],
    };
  },

  "[TOOLS-1] each state method is a tool with the same params plus pageId, and the same result": async (driver) => {
    const { url } = await shared(driver, LINK_READ);
    const [tools, view] = [toolsOf(driver, { by: 1, on: 1 }), viewOf(driver, viewer(1, url))];
    const byTool = await tools.ok(COMMIT, committing([put("a", { n: 1 })]));
    const byView = await view.ok(COMMIT, committing([put("b", { n: 2 })]));
    const [first, second] = [stored(byTool.commit, { id: "a", data: { n: 1 }, revision: 1 }), stored(byView.commit, { id: "b", data: { n: 2 }, revision: 1 })];
    const read = [{ document: first }, { documents: [first, second], seq: 2 }, { commits: [byTool.commit, byView.commit], seq: 2 }];
    return {
      got: [
        [await view.ok(STATE_GET, doc("a")), await view.ok(STATE_LIST, listing()), await view.ok(COMMITS, after(0))],
        [await tools.ok(STATE_GET, doc("a")), await tools.ok(STATE_LIST, listing()), await tools.ok(COMMITS, after(0))],
      ],
      want: [read, read],
    };
  },

  "[TOOLS-2] a tool call with viewer scope is forbidden": async (driver) => {
    await shared(driver, LINK_WRITE);
    const owner = toolsOf(driver, { by: 1, on: 1 });
    const refused = await Promise.all([
      owner.fails(STATE_GET, mine(doc("a"))),
      owner.fails(STATE_LIST, mine(listing())),
      owner.fails(COMMIT, mine(committing([]))),
      owner.fails(COMMITS, mine(after(0))),
    ]);
    return { got: [refused, await owner.ok(COMMITS, after(0))], want: [times(4, "Forbidden"), { commits: [], seq: 0 }] };
  },

  "[COMMON-5] a state request is checked in the order of section 2.1": async (driver) => {
    const { alice, url } = await shared(driver, LINK_READ);
    const [nowhere, owner, nobody] = [toolsOf(driver, { by: 1, on: 2 }), toolsOf(driver, { by: 1, on: 1 }), viewOf(driver, anonymous(url))];
    const [read, first] = [doc("a"), put("a", {})];
    const tooLarge = [put("b", objectOfBytes(limitsOf(driver).maxDocumentBytes + 1))];
    const malformedFirst = [await nowhere.fails(STATE_GET, having(read, ["scope", text(1)])), await nowhere.fails(COMMIT, committing([first, first]))];
    const namedNext = [await nowhere.fails(COMMIT, mine(committing(tooLarge))), await nowhere.fails(COMMITS, after(1))];
    const accessNext = [
      await toolsOf(driver, { by: 2, on: 1 }).fails(COMMIT, mine(committing(tooLarge))),
      await nobody.fails(COMMIT, committing(tooLarge)),
      await viewOf(driver, anonymous(`${url}x`)).fails(COMMITS, mine(after(1))),
    ];
    const signedInNext = await nobody.fails(COMMIT, mine(committing(tooLarge)));
    const limitsNext = [await owner.fails(COMMIT, committing(tooLarge)), await owner.fails(COMMIT, committing(tooLarge.map((op) => onlyIf(op, 1))))];
    const heldLast = [await owner.fails(COMMITS, after(1)), await owner.fails(COMMIT, committing([onlyIf(first, 1)])), await owner.ok(STATE_GET, read)];
    await alice.ok(DELETE, deleting(1));
    return {
      got: [malformedFirst, namedNext, accessNext, signedInNext, limitsNext, heldLast, await owner.fails(COMMITS, after(0))],
      want: [
        times(2, "InvalidParams"),
        times(2, "NotFound"),
        times(3, "Forbidden"),
        "Unauthenticated",
        times(2, "LimitExceeded"),
        ["InvalidParams", "Conflict", { document: null }],
        "NotFound",
      ],
    };
  },
};
