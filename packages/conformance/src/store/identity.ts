import { ID_PATTERN } from "@agentpages/protocol";
import { anonymous, type Cases, LINK_READ, LINK_WRITE, PRIVATE, viewer } from "./kit.js";
import { actorOf, COMMIT, committing, identityFails, identityOf, mine, shared, viewOf } from "./surface.js";

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
    return {
      got: [await identityFails(driver, viewer(2, url)), await identityFails(driver, anonymous(url)), (await actorOf(driver, viewer(1, url))).kind],
      want: ["Forbidden", "Forbidden", "viewer"],
    };
  },

  "[IDENT-2] the viewer is null for an anonymous viewer": async (driver) => {
    const { url } = await shared(driver, LINK_READ);
    return { got: await identityOf(driver, anonymous(url)), want: { viewer: null } };
  },

  "[IDENT-3] the id is the same for the same person on the same page, and is the id of their Actor in commits": async (driver) => {
    const { url } = await shared(driver, LINK_WRITE);
    const [bob, again, carol] = [await actorOf(driver, viewer(2, url)), await actorOf(driver, viewer(2, url)), await actorOf(driver, viewer(3, url))];
    const view = viewOf(driver, viewer(2, url));
    const onPage = await view.ok(COMMIT, committing([]));
    const own = await view.ok(COMMIT, mine(committing([])));
    return {
      got: [again, onPage.commit.by, own.commit.by, new Set([bob, carol].map((actor) => JSON.stringify(actor))).size, bob.kind],
      want: [bob, bob, bob, 2, "viewer"],
    };
  },
};
