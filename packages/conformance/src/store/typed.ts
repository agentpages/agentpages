import type { PageContent } from "@agentpages/protocol";
import type { Driver } from "../contract.js";
import { actingAs, agent, type Cases, collection, having, LINK_READ, objectOfBytes, page, PUBLISH, type Session, SET_ACCESS, sharing, text, type, TYPE_PUBLISH, typed, typeId, viewer } from "./kit.js";
import { type Acting, type ActingCases, COMMIT, committing, doc, limitsOf, mine, onBoth, onlyIf, put, remove, retyped, revisionsOf, seqOf, STATE_GET, stored, toolsOf, viewOf, within } from "./surface.js";

/** Documents whose title, when they have one, is a text, and that have nothing else. */
const titled = { type: "object", properties: { title: { type: "string" } }, additionalProperties: false };

/** Documents that say whether they are done. */
const tracked = { type: "object", required: ["done"] };

/** Publishes the first version of type `n`, whose only collection is `tasks`, and returns the content of a page of it. */
const ofTasks = async (alice: Session, n: number): Promise<PageContent> => {
  await alice.ok(TYPE_PUBLISH, having(type(n, 0), ["collections", { tasks: collection(titled) }]));
  return typed(n, 1);
};

/** Moves the page to a second version of its type, with other tasks and with notes. */
const moved = (driver: Driver, { page: n }: Acting): Promise<void> =>
  retyped(driver, { page: n, collections: { tasks: collection(tracked), notes: collection({}) } });

/** A collection no type of these cases declares. */
const undeclared = typeId(9);

const ON_BOTH: ActingCases = {
  "[TYPES-9] on a typed page, a put into a collection the type does not declare, or of data that does not match its schema, is malformed": async (acting) => {
    const fine = put("a", {});
    const refused = [
      await acting.answers(COMMIT, committing([fine, within(undeclared, fine)])),
      await acting.answers(COMMIT, committing([having(fine, ["data", { title: 7 }])])),
      await acting.answers(COMMIT, committing([having(fine, ["data", { title: text(1), more: 1 }])])),
    ];
    const allowed = [await revisionsOf(acting, [fine, within(undeclared, remove("a"))]), await revisionsOf(acting, [remove("a")])];
    return {
      got: [refused, allowed],
      want: [
        [
          ["InvalidParams", 1],
          ["InvalidParams", 0],
          ["InvalidParams", 0],
        ],
        [[1], [2]],
      ],
    };
  },

  "[TYPES-9] the type version that checks a commit is the one the page names when the commit arrives": async (acting, driver) => {
    const [note, done, open] = [within("notes", put("n", {})), put("a", { done: 1, title: 7 }), put("b", {})];
    const before = [await acting.fails(COMMIT, committing([note])), await acting.fails(COMMIT, committing([done])), await revisionsOf(acting, [open])];
    await moved(driver, acting);
    const after = [await acting.fails(COMMIT, committing([open])), await revisionsOf(acting, [note, done])];
    return { got: [before, after], want: [["InvalidParams", "InvalidParams", [1]], ["InvalidParams", [1, 1]]] };
  },

  "[TYPES-11] documents already stored are not checked again when a page moves to another type version": async (acting, driver) => {
    const open = put("a", { title: text(1) });
    const { commit } = await acting.ok(COMMIT, committing([open]));
    await moved(driver, acting);
    const kept = { document: stored(commit, { id: "a", data: { title: text(1) }, revision: 1 }) };
    return {
      got: [await acting.ok(STATE_GET, doc("a")), await acting.fails(COMMIT, committing([open])), await acting.ok(STATE_GET, doc("a"))],
      want: [kept, "InvalidParams", kept],
    };
  },

  "[COMMON-5] what the type of a page does not allow is decided after the limits and before a conflict": async (acting, driver) => {
    const [fine, wrong] = [put("a", {}), put("b", { title: 7 })];
    const tooLarge = put("c", objectOfBytes(limitsOf(driver).maxDocumentBytes + 1));
    return {
      got: [
        await acting.answers(COMMIT, committing([wrong, tooLarge])),
        await acting.answers(COMMIT, committing([onlyIf(fine, 1), onlyIf(wrong, 1)])),
        await acting.answers(COMMIT, committing([fine, onlyIf(put("d", {}), 1)])),
      ],
      want: [
        ["LimitExceeded", 1],
        ["InvalidParams", 1],
        ["Conflict", 1],
      ],
    };
  },
};

const EACH: Cases = {
  "[TYPES-9] the viewer scope of a typed page holds whatever its viewer puts there": async (driver) => {
    const alice = actingAs(driver, agent(1));
    await alice.ok(PUBLISH, having(page(1, 0), ["content", await ofTasks(alice, 1)]));
    const bob = viewOf(driver, viewer(2, (await alice.ok(SET_ACCESS, sharing(1, LINK_READ))).url));
    const [owner, ops] = [toolsOf(driver, { by: 1, on: 1 }), [put("a", { title: 7 })]];
    const own = await bob.ok(COMMIT, mine(committing(ops)));
    return {
      got: [await owner.fails(COMMIT, committing(ops)), own.commit.changes.map((change) => change.revision), await seqOf(owner, [])],
      want: ["InvalidParams", [1], 1],
    };
  },
};

export const TYPED_CASES: Cases = { ...onBoth(ON_BOTH, ofTasks), ...EACH };
