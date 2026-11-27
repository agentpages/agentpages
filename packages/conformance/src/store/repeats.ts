import { actingAs, agent, anonymous, type Cases, DELETE, deleting, having, LINK_READ, LINK_WRITE, page, PUBLISH, type Session, SET_ACCESS, sharing, viewer, type Visit } from "./kit.js";
import { COMMIT, committing, put, toolsOf, viewOf } from "./surface.js";

/** The link of page `n`, published and shared for writing. */
const linked = async (alice: Session, n: number): Promise<string> => {
  await alice.ok(PUBLISH, page(n, 0));
  return (await alice.ok(SET_ACCESS, sharing(n, LINK_WRITE))).url;
};

/** What a repeated commit has to do with who sends it and where. */
export const REPEAT_CASES: Cases = {
  "[REL-29] the opId of a commit belongs to its viewer and its page, and all anonymous viewers of a page are one caller": async (driver) => {
    const alice = actingAs(driver, agent(1));
    const [first, second] = [await linked(alice, 1), await linked(alice, 2)];
    const [params, other] = [committing([]), committing([put("a", {})])];
    const seqOf = async (visit: Visit): Promise<number> => (await viewOf(driver, visit).ok(COMMIT, params)).commit.seq;
    const taken = [await seqOf(viewer(2, first)), await seqOf(viewer(3, first)), await seqOf(anonymous(first)), await seqOf(viewer(2, second))];
    const repeated = [await seqOf(viewer(2, first)), await seqOf(anonymous(first)), await seqOf(viewer(3, first))];
    const otherParams = await viewOf(driver, anonymous(first)).fails(COMMIT, having(other, ["opId", params.opId]));
    const applied = await viewOf(driver, anonymous(first)).ok(COMMIT, other);
    return { got: [taken, repeated, otherParams, applied.commit.seq], want: [[1, 2, 3, 1], [1, 3, 2], "InvalidParams", 4] };
  },

  "[REL-30] a repeated commit is recognised only while its page exists and its caller has access": async (driver) => {
    const alice = actingAs(driver, agent(1));
    const [bob, owner] = [viewOf(driver, viewer(2, await linked(alice, 1))), toolsOf(driver, { by: 1, on: 1 })];
    const [byBob, byOwner] = [committing([]), committing([])];
    const first = [await bob.ok(COMMIT, byBob), await owner.ok(COMMIT, byOwner)];
    const repeated = [await bob.ok(COMMIT, byBob), await owner.ok(COMMIT, byOwner)];
    await alice.ok(SET_ACCESS, sharing(1, LINK_READ));
    const withoutAccess = await bob.fails(COMMIT, byBob);
    await alice.ok(DELETE, deleting(1));
    return {
      got: [repeated, withoutAccess, await bob.fails(COMMIT, byBob), await owner.fails(COMMIT, byOwner)],
      want: [first, "Forbidden", "NotFound", "NotFound"],
    };
  },
};
