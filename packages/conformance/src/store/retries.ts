import type { PagesGetResult, PagesListResult, PagesVersionsResult, TypesListResult } from "@agentpages/protocol";
import type { Driver } from "../contract.js";
import {
  actingAs,
  agent,
  type Cases,
  DELETE,
  deleting,
  GET,
  having,
  html,
  htmlOfBytes,
  LINK_READ,
  LINK_WRITE,
  LIST,
  page,
  PUBLISH,
  reading,
  readingType,
  type Session,
  SET_ACCESS,
  sharing,
  text,
  timeOf,
  times,
  type,
  TYPE_GET,
  TYPE_LIST,
  TYPE_PUBLISH,
  typed,
  VERSIONS,
  withVersions,
} from "./kit.js";

type Everything = [PagesGetResult, PagesVersionsResult, PagesListResult, TypesListResult];

/** Everything agent 1 can read of page 1, of its other pages and of the types. */
const everything = (alice: Session): Promise<Everything> =>
  Promise.all([alice.ok(GET, reading(1)), alice.ok(VERSIONS, reading(1)), alice.ok(LIST, {}), alice.ok(TYPE_LIST, {})]);

/** Agent 1 with two versions of page 1 and a type. */
const settledStore = async (driver: Driver): Promise<Session> => {
  const alice = await withVersions(driver, 2);
  await alice.ok(TYPE_PUBLISH, type(1, 0));
  return alice;
};

export const RETRY_CASES: Cases = {
  "[STORE-5] every tool that changes anything takes an opId": async (driver) => {
    const alice = await settledStore(driver);
    const before = await everything(alice);
    const withoutOpId = await Promise.all([
      alice.fails(PUBLISH, having(page(1, 2), ["opId", undefined])),
      alice.fails(SET_ACCESS, having(sharing(1, LINK_READ), ["opId", undefined])),
      alice.fails(DELETE, having(deleting(1), ["opId", undefined])),
      alice.fails(TYPE_PUBLISH, having(type(1, 1), ["opId", undefined])),
    ]);
    return { got: [withoutOpId, await everything(alice)], want: [times(4, "InvalidParams"), before] };
  },

  "[REL-1] a request that changes something carries an opId, and one that only reads carries none": async (driver) => {
    const alice = await settledStore(driver);
    const [page1, { versions }, { pages }, { types }] = await everything(alice);
    const deck = await alice.ok(TYPE_GET, readingType(1));
    const next = await alice.ok(PUBLISH, page(1, 2));
    return {
      got: [page1.version, versions.length, pages.length, types.length, deck.version, next.version],
      want: [2, 2, 1, 1, 1, 3],
    };
  },

  "[REL-2] a request repeated with its opId is applied once and gets the first result again": async (driver) => {
    const alice = actingAs(driver, agent(1));
    const [publish, share, declare] = [page(1, 0), sharing(1, LINK_READ), type(1, 0)];
    const first = [await alice.ok(PUBLISH, publish), await alice.ok(SET_ACCESS, share), await alice.ok(TYPE_PUBLISH, declare)];
    await alice.ok(PUBLISH, page(1, 1));
    await alice.ok(SET_ACCESS, sharing(1, LINK_WRITE));
    await alice.ok(TYPE_PUBLISH, type(1, 1));
    const again = [await alice.ok(PUBLISH, publish), await alice.ok(SET_ACCESS, share), await alice.ok(TYPE_PUBLISH, declare)];
    const current = await alice.ok(GET, reading(1));
    return {
      got: [again, current.version, current.access, (await alice.ok(TYPE_GET, readingType(1))).version],
      want: [first, 2, "link-write", 2],
    };
  },

  "[REL-2] copies of a request that arrive together are applied once and get one result": async (driver) => {
    const alice = actingAs(driver, agent(1));
    const publish = page(1, 0);
    const copies = await Promise.all([1, 2, 3, 4].map(() => alice.ok(PUBLISH, publish)));
    const [first] = copies;
    const { versions } = await alice.ok(VERSIONS, reading(1));
    return { got: [copies, versions.length, await alice.ok(GET, reading(1))], want: [copies.map(() => first), 1, { ...first, content: html(1) }] };
  },

  "[REL-3] an opId used again with other params is malformed": async (driver) => {
    const alice = actingAs(driver, agent(1));
    const publish = page(1, 0);
    const rich = { ...publish, content: { ...html(1), csp: { hosts: [1, 2], frames: { a: 1, b: null } } } };
    const published = await alice.ok(PUBLISH, rich);
    const reordered = { ...publish, content: { ...html(1), csp: { frames: { b: null, a: 1 }, hosts: [1, 2] } } };
    const others = await Promise.all([
      alice.fails(PUBLISH, having(rich, ["title", text(2)])),
      alice.fails(SET_ACCESS, having(sharing(1, LINK_READ), ["opId", publish.opId])),
      alice.fails(DELETE, having(deleting(1), ["opId", publish.opId])),
    ]);
    return {
      got: [others, await alice.ok(PUBLISH, reordered), await alice.ok(LIST, {})],
      want: [times(3, "InvalidParams"), published, { pages: [published] }],
    };
  },

  "[REL-4] an opId is remembered for at least opRetentionSeconds": async (driver) => {
    const alice = actingAs(driver, agent(1));
    const { opRetentionSeconds } = driver.capability.limits;
    const publish = page(1, 0);
    const published = await alice.ok(PUBLISH, publish);
    driver.advance(opRetentionSeconds * 1000);
    const later = await alice.ok(PUBLISH, page(2, 0));
    const { versions } = await alice.ok(VERSIONS, reading(1));
    return {
      got: [await alice.ok(PUBLISH, publish), (timeOf(later.updatedAt) - timeOf(published.updatedAt)) / 1000, versions.length],
      want: [published, opRetentionSeconds, 1],
    };
  },

  "[REL-8] a request the Store refuses changes nothing": async (driver) => {
    const [alice, bob] = [await settledStore(driver), actingAs(driver, agent(2))];
    const before = await everything(alice);
    const tooLarge = htmlOfBytes(driver.capability.limits.maxHtmlBytes + 1);
    const refused = await Promise.all([
      alice.fails(PUBLISH, page(1, 1)),
      alice.fails(TYPE_PUBLISH, type(1, 0)),
      alice.fails(PUBLISH, having(page(1, 2), ["content", tooLarge])),
      alice.fails(PUBLISH, having(page(1, 2), ["content", typed(1, 2)])),
      bob.fails(SET_ACCESS, sharing(1, LINK_WRITE)),
      bob.fails(DELETE, deleting(1)),
      bob.fails(TYPE_PUBLISH, type(1, 1)),
      alice.fails(SET_ACCESS, sharing(1, 1)),
    ]);
    return {
      got: [refused, await everything(alice)],
      want: [["Conflict", "Conflict", "LimitExceeded", "NotFound", "Forbidden", "Forbidden", "Forbidden", "InvalidParams"], before],
    };
  },

  "[REL-30] a repeated opId is recognised only once its page is found": async (driver) => {
    const alice = actingAs(driver, agent(1));
    const [publish, share] = [page(1, 0), sharing(1, LINK_READ)];
    const first = [await alice.ok(PUBLISH, publish), await alice.ok(SET_ACCESS, share)];
    const repeated = [await alice.ok(PUBLISH, publish), await alice.ok(SET_ACCESS, share)];
    await alice.ok(DELETE, deleting(1));
    return {
      got: [repeated, await alice.fails(PUBLISH, publish), await alice.fails(SET_ACCESS, share)],
      want: [first, "NotFound", "NotFound"],
    };
  },

  "[REL-30] a repeat with the same params gets its first result, and an opId used again with other params is decided after the limits": async (driver) => {
    const [alice, bob] = [actingAs(driver, agent(1)), actingAs(driver, agent(2))];
    const publish = page(1, 0);
    const tooLarge = having(publish, ["content", htmlOfBytes(driver.capability.limits.maxHtmlBytes + 1)]);
    const first = await alice.ok(PUBLISH, publish);
    await alice.ok(PUBLISH, page(1, 1));
    return {
      got: [await alice.ok(PUBLISH, publish), await alice.fails(PUBLISH, tooLarge), await alice.fails(PUBLISH, having(publish, ["title", text(2)])), await bob.fails(PUBLISH, tooLarge)],
      want: [first, "LimitExceeded", "InvalidParams", "Forbidden"],
    };
  },

  "[REL-31] a request that failed is not remembered": async (driver) => {
    const alice = actingAs(driver, agent(1));
    const [stale, large] = [page(1, 3), page(2, 0)];
    const tooLarge = htmlOfBytes(driver.capability.limits.maxHtmlBytes + 1);
    const errors = [await alice.fails(PUBLISH, stale), await alice.fails(PUBLISH, having(large, ["content", tooLarge]))];
    const published = [await alice.ok(PUBLISH, having(stale, ["baseVersion", 0])), await alice.ok(PUBLISH, large)];
    return {
      got: [errors, published.map((info) => info.version), await alice.ok(PUBLISH, large)],
      want: [["Conflict", "LimitExceeded"], [1, 1], published[1]],
    };
  },
};
