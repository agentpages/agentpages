import { CapabilitySchema, PROTOCOL_VERSION, validate } from "@agentpages/protocol";
import {
  actingAs,
  agent,
  type Cases,
  collection,
  DELETE,
  deleting,
  GET,
  having,
  htmlOfBytes,
  inPagesOfTwo,
  inTurn,
  LINK_READ,
  LIST,
  ofBytes,
  ofLength,
  page,
  PUBLISH,
  reading,
  type Session,
  SET_ACCESS,
  sharing,
  text,
  tick,
  times,
  type,
  TYPE_LIST,
  TYPE_PUBLISH,
  typed,
  typeId,
  versionOf,
  VERSIONS,
  withPage,
  withVersions,
} from "./kit.js";

/** What a caller is told who is over a limit of html on an existing page, a deleted page and an existing type. */
const overTheLimit = (session: Session, bytes: number): Promise<string[]> =>
  Promise.all([
    ...[1, 2].map((n) => session.fails(PUBLISH, having(page(n, 0), ["content", htmlOfBytes(bytes)]))),
    session.fails(TYPE_PUBLISH, having(type(1, 1), ["content", { html: ofBytes(bytes) }])),
  ]);

export const COMMON_CASES: Cases = {
  "[COMMON-4] a list without a limit returns 100 items, and nextCursor exactly when more exist": async (driver) => {
    const alice = await withVersions(driver, 101);
    const first = await alice.ok(VERSIONS, reading(1));
    const rest = await alice.ok(VERSIONS, having(reading(1), ["cursor", first.nextCursor]));
    const one = await alice.ok(VERSIONS, having(reading(1), ["limit", 1]));
    const hundred = await alice.ok(VERSIONS, having(reading(1), ["cursor", one.nextCursor]));
    return {
      got: [first.versions.length, rest.versions.map(({ version }) => version), Object.keys(rest), hundred.versions.length, Object.keys(hundred)],
      want: [100, [101], ["versions"], 100, ["versions"]],
    };
  },

  "[COMMON-4] every list returns its items in pages of the limit it was given": async (driver) => {
    const alice = await withVersions(driver, 5);
    await alice.ok(TYPE_PUBLISH, type(1, 0));
    await inTurn([3, 2, 4, 5], (n) => {
      tick(driver);
      return Promise.all([alice.ok(PUBLISH, page(n, 0)), alice.ok(TYPE_PUBLISH, type(n, 0))]);
    });
    const versions = await inPagesOfTwo((paging) => alice.ok(VERSIONS, { ...reading(1), ...paging }));
    const pages = await inPagesOfTwo((paging) => alice.ok(LIST, paging));
    const types = await inPagesOfTwo((paging) => alice.ok(TYPE_LIST, paging));
    return {
      got: [
        versions.map((listed) => listed.versions.map(({ version }) => version)),
        pages.map((listed) => listed.pages.map((info) => info.title)),
        types.map((listed) => listed.types.map((info) => info.typeId)),
        [versions, pages, types].map(([, , last]) => Object.keys(last).length),
      ],
      want: [
        [[1, 2], [3, 4], [5]],
        [[text(5), text(4)], [text(2), text(3)], [text(1)]],
        [[typeId(1), typeId(2)], [typeId(3), typeId(4)], [typeId(5)]],
        [1, 1, 1],
      ],
    };
  },

  "[COMMON-4] a cursor with a character that is not printable ASCII is malformed": async (driver) => {
    const alice = await withVersions(driver, 1);
    const from = (cursor: string): Promise<string> => alice.fails(VERSIONS, having(reading(1), ["cursor", cursor]));
    return {
      got: [await from("\u0001a"), await from("a\u007F"), await from("\u00E9"), (await alice.ok(VERSIONS, having(reading(1), ["cursor", "~ "]))).versions],
      want: ["InvalidParams", "InvalidParams", "InvalidParams", []],
    };
  },

  "[COMMON-5] a malformed request is malformed, whatever else is wrong with it": async (driver) => {
    const [alice, bob] = [actingAs(driver, agent(1)), actingAs(driver, agent(2))];
    await alice.ok(TYPE_PUBLISH, type(1, 0));
    const schema = { type: 7, description: ofBytes(driver.capability.limits.maxSchemaBytes) };
    return {
      got: [
        await alice.fails(GET, reading(1)),
        await alice.fails(GET, versionOf(-1)),
        await bob.fails(SET_ACCESS, sharing(1, LINK_READ)),
        await bob.fails(SET_ACCESS, sharing(1, 1)),
        await bob.fails(TYPE_PUBLISH, type(1, 1)),
        await bob.fails(TYPE_PUBLISH, having(type(1, 1), ["collections", { tasks: collection(schema) }])),
      ],
      want: ["NotFound", "InvalidParams", "NotFound", "InvalidParams", "Forbidden", "InvalidParams"],
    };
  },

  "[COMMON-5] what a request names is looked for before the caller's access": async (driver) => {
    const [{ alice }, bob] = [await withPage(driver), actingAs(driver, agent(2))];
    await alice.ok(PUBLISH, page(3, 0));
    await alice.ok(DELETE, deleting(3));
    return {
      got: await Promise.all([
        bob.fails(GET, reading(1)),
        bob.fails(GET, reading(2)),
        bob.fails(SET_ACCESS, sharing(2, LINK_READ)),
        bob.fails(PUBLISH, having(page(1, 1), ["content", typed(1, 1)])),
        bob.fails(PUBLISH, page(3, 0)),
      ]),
      want: ["Forbidden", "NotFound", "NotFound", "NotFound", "NotFound"],
    };
  },

  "[COMMON-5] the caller's access is checked before the limits, and what a request names before both": async (driver) => {
    const [{ alice }, bob] = [await withPage(driver), actingAs(driver, agent(2))];
    const tooLarge = driver.capability.limits.maxHtmlBytes + 1;
    await Promise.all([alice.ok(PUBLISH, page(2, 0)), alice.ok(TYPE_PUBLISH, type(1, 0))]);
    await alice.ok(DELETE, deleting(2));
    return {
      got: [await overTheLimit(bob, tooLarge), await overTheLimit(alice, tooLarge)],
      want: [
        ["Forbidden", "NotFound", "Forbidden"],
        ["LimitExceeded", "NotFound", "LimitExceeded"],
      ],
    };
  },

  "[COMMON-9] a value that breaks a rule of section 2.1 is malformed": async (driver) => {
    const alice = actingAs(driver, agent(1));
    const broken = await Promise.all([
      alice.fails(GET, having(reading(1), ["pageId", reading(1).pageId.slice(1)])),
      alice.fails(GET, having(reading(1), ["pageId", 1])),
      alice.fails(GET, versionOf(-1)),
      alice.fails(LIST, having({}, ["limit", 0])),
      alice.fails(LIST, having({}, ["limit", 101])),
      alice.fails(LIST, having({}, ["limit", 1.5])),
      alice.fails(PUBLISH, page(1, 9_007_199_254_740_992)),
      alice.fails(PUBLISH, having(page(1, 0), ["title", ofLength(256)])),
      alice.fails(PUBLISH, having(page(1, 0), ["description", ofLength(1025)])),
      alice.fails(TYPE_PUBLISH, having(type(1, 0), ["typeId", ofLength(129)])),
      alice.fails(TYPE_PUBLISH, having(type(1, 0), ["typeId", String(1.5)])),
      alice.fails(TYPE_PUBLISH, having(type(1, 0), ["instructions", ofLength(65_537)])),
    ]);
    const longest = await alice.ok(PUBLISH, { ...page(1, 0), title: ofLength(255), description: ofLength(1024) });
    const type128 = await alice.ok(TYPE_PUBLISH, { ...type(1, 0), typeId: ofLength(128), instructions: ofLength(65_536) });
    return {
      got: [broken, longest.title.length, longest.description, type128.typeId.length, type128.instructions.length],
      want: [times(12, "InvalidParams"), 255, ofLength(1024), 128, 65_536],
    };
  },

  "[EXT-1] the Store advertises the capability object of section 3": (driver) =>
    Promise.resolve({
      got: [validate(CapabilitySchema, driver.capability), driver.capability.version],
      want: [{ ok: true, value: driver.capability }, PROTOCOL_VERSION],
    }),
};
