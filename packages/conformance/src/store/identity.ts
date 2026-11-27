import { ID_PATTERN } from "@agentpages/protocol";
import { actingAs, agent, anonymous, type Cases, LINK_READ, LINK_WRITE, page, PRIVATE, PUBLISH, SET_ACCESS, sharing, viewer } from "./kit.js";
import { COMMIT, committing, identityFails, identityOf, mine, shared, viewOf } from "./surface.js";
import type { Driver } from "../contract.js";

/** The id `identity/get` gives agent `n` as a viewer who holds `url`. */
const idOf = async (driver: Driver, [n, url]: [number, string]): Promise<string> =>
  Object.assign({}, (await identityOf(driver, viewer(n, url))).viewer).id;

export const IDENTITY_CASES: Cases = {
  "[IDENT-1] identity/get returns the viewer: an id, and a name when they have one": async (driver) => {
    const { url } = await shared(driver, LINK_READ);
    const bob = await identityOf(driver, viewer(2, url));
    const carol = await identityOf(driver, { ...viewer(3, url), name: "Carol" });
    const ids = [bob, carol].map((shown) => Object.assign({}, shown.viewer).id);
    return {
      got: [bob, carol, ids.map((id) => ID_PATTERN.test(id))],
      want: [{ viewer: { id: ids[0] } }, { viewer: { id: ids[1], name: "Carol" } }, [true, true]],
    };
  },

  "[IDENT-1] identity/get answers whoever can read the page, and nobody else": async (driver) => {
    const { url } = await shared(driver, PRIVATE);
    const owner = await identityOf(driver, viewer(1, url));
    return {
      got: [await identityFails(driver, viewer(2, url)), await identityFails(driver, anonymous(url)), Object.keys(Object.assign({}, owner.viewer))],
      want: ["Forbidden", "Forbidden", ["id"]],
    };
  },

  "[IDENT-2] the viewer is null for an anonymous viewer": async (driver) => {
    const { url } = await shared(driver, LINK_READ);
    return { got: await identityOf(driver, anonymous(url)), want: { viewer: null } };
  },

  "[IDENT-3] the id is the same for the same person on the same page for as long as the page exists, and another on another page": async (driver) => {
    const { alice, url } = await shared(driver, LINK_READ);
    const elsewhere = await alice.ok(PUBLISH, page(2, 0)).then(() => alice.ok(SET_ACCESS, sharing(2, LINK_READ)));
    const [bob, again, carol, bobElsewhere] = [await idOf(driver, [2, url]), await idOf(driver, [2, url]), await idOf(driver, [3, url]), await idOf(driver, [2, elsewhere.url])];
    await alice.ok(PUBLISH, page(1, 1)).then(() => alice.ok(SET_ACCESS, sharing(1, PRIVATE)));
    const relinked = await alice.ok(SET_ACCESS, sharing(1, LINK_WRITE));
    return {
      got: [again, await idOf(driver, [2, relinked.url]), new Set([bob, carol, bobElsewhere]).size, new Set([url, relinked.url]).size, [bob, carol, bobElsewhere].map((id) => typeof id)],
      want: [bob, bob, 3, 2, ["string", "string", "string"]],
    };
  },
};

/** What the identity of a viewer has to do with their commits, for a Store that advertises both. */
export const IDENTITY_IN_STATE_CASES: Cases = {
  "[IDENT-3] the id is the id of the viewer's Actor in commits": async (driver) => {
    const { url } = await shared(driver, LINK_WRITE);
    const alice = actingAs(driver, agent(1));
    const elsewhere = await alice.ok(PUBLISH, page(2, 0)).then(() => alice.ok(SET_ACCESS, sharing(2, LINK_WRITE)));
    const [view, other] = [viewOf(driver, viewer(2, url)), viewOf(driver, viewer(2, elsewhere.url))];
    const made = [await view.ok(COMMIT, committing([])), await view.ok(COMMIT, mine(committing([]))), await other.ok(COMMIT, committing([]))];
    const [here, there] = [await idOf(driver, [2, url]), await idOf(driver, [2, elsewhere.url])];
    return {
      got: made.map(({ commit }) => commit.by),
      want: [here, here, there].map((id) => ({ kind: "viewer", id })),
    };
  },
};
