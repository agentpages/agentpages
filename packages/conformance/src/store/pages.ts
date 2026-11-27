import {
  actingAs,
  agent,
  anonymous,
  type Cases,
  DELETE,
  deleting,
  GET,
  guards,
  having,
  html,
  htmlOfBytes,
  LINK_READ,
  LINK_WRITE,
  LIST,
  openFails,
  page,
  PRIVATE,
  PUBLISH,
  reading,
  type Session,
  SET_ACCESS,
  sharing,
  text,
  tick,
  timeOf,
  times,
  versionOf,
  VERSIONS,
  viewer,
  withPage,
  withVersions,
} from "./kit.js";

const titlesOf = async (session: Session): Promise<string[]> => (await session.ok(LIST, {})).pages.map((info) => info.title);

export const PAGES_CASES: Cases = {
  "[PAGES-1] pages_publish creates a page and returns its PageInfo": async (driver) => {
    const info = await actingAs(driver, agent(1)).ok(PUBLISH, having(page(1, 0), ["description", text(2)]));
    return {
      got: info,
      want: {
        pageId: "00000000-0000-4000-8000-000000000001",
        title: "Text 1",
        description: "Text 2",
        version: 1,
        access: info.access,
        url: info.url,
        updatedAt: info.updatedAt,
      },
    };
  },

  "[PAGES-2] pages_get returns the PageInfo and exactly the content that was published": async (driver) => {
    const alice = actingAs(driver, agent(1));
    const info = await alice.ok(PUBLISH, having(page(1, 0), ["content", { ...html(1), ...guards(1) }]));
    const want = {
      ...info,
      content: {
        kind: "html",
        html: "<!doctype html><title>1</title>",
        csp: { connectDomains: ["https://1.example"], frames: { last: null, first: [1, { deep: true }] } },
        permissions: { camera: {} },
      },
    };
    return { got: [await alice.ok(GET, reading(1)), await alice.ok(GET, versionOf(1))], want: [want, want] };
  },

  "[PAGES-3] pages_list returns the PageInfo of each of the caller's pages": async (driver) => {
    const alice = actingAs(driver, agent(1));
    const older = await alice.ok(PUBLISH, page(2, 0));
    tick(driver);
    const newer = await alice.ok(PUBLISH, page(1, 0));
    return { got: await alice.ok(LIST, {}), want: { pages: [newer, older] } };
  },

  "[PAGES-4] pages_versions returns each version with the time it was published": async (driver) => {
    const { alice, published: first } = await withPage(driver);
    tick(driver);
    const second = await alice.ok(PUBLISH, page(1, 1));
    const versions = [
      { version: 1, createdAt: first.updatedAt },
      { version: 2, createdAt: second.updatedAt },
    ];
    return {
      got: [await alice.ok(VERSIONS, reading(1)), timeOf(second.updatedAt) - timeOf(first.updatedAt)],
      want: [{ versions }, 1000],
    };
  },

  "[PAGES-5] pages_set_access changes who can open the page and returns its PageInfo": async (driver) => {
    const { alice, published } = await withPage(driver);
    tick(driver);
    const linked = await alice.ok(SET_ACCESS, sharing(1, LINK_WRITE));
    return {
      got: [linked, await alice.ok(LIST, {}), timeOf(linked.updatedAt) - timeOf(published.updatedAt)],
      want: [{ ...published, access: "link-write", url: linked.url, updatedAt: linked.updatedAt }, { pages: [linked] }, 1000],
    };
  },

  "[PAGES-6] pages_delete returns an empty object": async (driver) => {
    const { alice } = await withPage(driver);
    return { got: [await alice.ok(DELETE, deleting(1)), await alice.ok(LIST, {})], want: [{}, { pages: [] }] };
  },

  "[PAGES-7] pages_publish succeeds only from the current version, and creates the next one": async (driver) => {
    const alice = actingAs(driver, agent(1));
    const outcomes = [
      await alice.fails(PUBLISH, page(1, 1)),
      (await alice.ok(PUBLISH, page(1, 0))).version,
      await alice.fails(PUBLISH, page(1, 0)),
      await alice.fails(PUBLISH, page(1, 2)),
      (await alice.ok(PUBLISH, page(1, 1))).version,
      (await alice.ok(PUBLISH, page(1, 2))).version,
      await alice.fails(PUBLISH, page(1, 2)),
    ];
    return {
      got: [outcomes, (await alice.ok(GET, reading(1))).version],
      want: [["Conflict", 1, "Conflict", "Conflict", 2, 3, "Conflict"], 3],
    };
  },

  "[PAGES-8] a published version never changes": async (driver) => {
    const alice = actingAs(driver, agent(1));
    await alice.ok(PUBLISH, having(page(1, 0), ["description", text(2)]));
    const before = await alice.ok(GET, versionOf(1));
    await alice.ok(PUBLISH, { ...page(1, 1), title: text(3), content: html(4) });
    const { access, url, updatedAt } = await alice.ok(SET_ACCESS, sharing(1, LINK_READ));
    return {
      got: [await alice.ok(GET, versionOf(1)), await alice.ok(GET, versionOf(2))],
      want: [
        { ...before, description: text(2), access, url, updatedAt },
        { ...reading(1), title: text(3), version: 2, access, url, updatedAt, content: html(4) },
      ],
    };
  },

  "[PAGES-9] csp and permissions belong to a version": async (driver) => {
    const alice = actingAs(driver, agent(1));
    await alice.ok(PUBLISH, having(page(1, 0), ["content", { ...html(1), ...guards(1) }]));
    await alice.ok(PUBLISH, page(1, 1));
    const current = await alice.ok(GET, reading(1));
    const first = await alice.ok(GET, versionOf(1));
    return { got: [current.content, first.content], want: [html(1), { ...html(1), ...guards(1) }] };
  },

  "[PAGES-10] a new page is private": async (driver) => {
    const { published } = await withPage(driver);
    return { got: [published.access, await openFails(driver, anonymous(published.url))], want: ["private", "Forbidden"] };
  },

  "[PAGES-11] pages_get without a version returns the current one": async (driver) => {
    const alice = await withVersions(driver, 3);
    const current = await alice.ok(GET, reading(1));
    const second = await alice.ok(GET, versionOf(2));
    return {
      got: [current, current.version, second.version, await alice.fails(GET, versionOf(4))],
      want: [await alice.ok(GET, versionOf(3)), 3, 2, "NotFound"],
    };
  },

  "[PAGES-12] pages_list returns only the caller's pages, most recently updated first": async (driver) => {
    const [alice, bob] = [actingAs(driver, agent(1)), actingAs(driver, agent(2))];
    await Promise.all([0, 1, 2].map((n) => alice.ok(PUBLISH, page(n, 0))));
    await bob.ok(PUBLISH, page(3, 0));
    tick(driver);
    await alice.ok(SET_ACCESS, sharing(1, LINK_READ));
    const afterSharing = await titlesOf(alice);
    tick(driver);
    await alice.ok(PUBLISH, page(0, 1));
    return {
      got: [afterSharing, await titlesOf(alice), await titlesOf(bob), await titlesOf(actingAs(driver, agent(3)))],
      want: [[text(1), text(2), text(0)], [text(0), text(1), text(2)], [text(3)], []],
    };
  },

  "[PAGES-13] pages_versions orders by version, ascending": async (driver) => {
    const { versions } = await (await withVersions(driver, 12)).ok(VERSIONS, reading(1));
    return { got: versions.map(({ version }) => version), want: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };
  },

  "[PAGES-6] pages_delete removes the page with its versions": async (driver) => {
    const alice = await withVersions(driver, 2);
    const kept = await alice.ok(PUBLISH, page(2, 0));
    const { url } = await alice.ok(SET_ACCESS, sharing(1, LINK_READ));
    await alice.ok(DELETE, deleting(1));
    const gone = [alice.fails(GET, reading(1)), alice.fails(GET, versionOf(1)), alice.fails(VERSIONS, reading(1))];
    const refused = await Promise.all([...gone, openFails(driver, viewer(1, url)), openFails(driver, anonymous(url))]);
    return { got: [refused, await alice.ok(LIST, {})], want: [times(5, "NotFound"), { pages: [kept] }] };
  },

  "[PAGES-15] pages_delete of a page that does not exist succeeds": async (driver) => {
    const { alice } = await withPage(driver);
    const never = await alice.ok(DELETE, deleting(2));
    const first = await alice.ok(DELETE, deleting(1));
    const again = await alice.ok(DELETE, deleting(1));
    const byAnother = await actingAs(driver, agent(2)).ok(DELETE, deleting(1));
    return { got: [never, first, again, byAnother, await alice.fails(GET, reading(1))], want: [{}, {}, {}, {}, "NotFound"] };
  },

  "[PAGES-17] html larger than maxHtmlBytes, in UTF-8 bytes, is beyond the limit": async (driver) => {
    const alice = actingAs(driver, agent(1));
    const { maxHtmlBytes } = driver.capability.limits;
    const tooLarge = htmlOfBytes(maxHtmlBytes + 1);
    const outcomes = [
      await alice.fails(PUBLISH, having(page(1, 0), ["content", tooLarge])),
      await alice.fails(GET, reading(1)),
      (await alice.ok(PUBLISH, having(page(1, 0), ["content", htmlOfBytes(maxHtmlBytes)]))).version,
      await alice.fails(PUBLISH, having(page(1, 1), ["content", tooLarge])),
    ];
    return {
      got: [outcomes, (await alice.ok(GET, reading(1))).content],
      want: [["LimitExceeded", "NotFound", 1, "LimitExceeded"], htmlOfBytes(maxHtmlBytes)],
    };
  },

  "[PAGES-18] a deleted pageId is never used again": async (driver) => {
    const [{ alice }, bob] = [await withPage(driver), actingAs(driver, agent(2))];
    await alice.ok(DELETE, deleting(1));
    const published = [alice.fails(PUBLISH, page(1, 0)), alice.fails(PUBLISH, page(1, 1)), bob.fails(PUBLISH, page(1, 0))];
    const read = [alice.fails(GET, reading(1)), alice.fails(VERSIONS, reading(1)), alice.fails(SET_ACCESS, sharing(1, LINK_READ))];
    const refused = await Promise.all([...published, ...read]);
    return {
      got: [refused, await alice.ok(DELETE, deleting(1)), await alice.ok(LIST, {})],
      want: [times(6, "NotFound"), {}, { pages: [] }],
    };
  },

  "[PAGES-20] updatedAt changes when a version is published or the access changes, and at no other time": async (driver) => {
    const { alice, published } = await withPage(driver);
    const since = (info: { updatedAt: string }): number => timeOf(info.updatedAt) - timeOf(published.updatedAt);
    tick(driver);
    const failed = await alice.fails(PUBLISH, page(1, 0));
    const same = await alice.ok(SET_ACCESS, sharing(1, PRIVATE));
    const read = [await alice.ok(GET, reading(1)), ...(await alice.ok(LIST, {})).pages];
    const linked = await alice.ok(SET_ACCESS, sharing(1, LINK_READ));
    tick(driver);
    const republished = await alice.ok(PUBLISH, page(1, 1));
    return {
      got: [failed, [same, ...read, linked, republished, await alice.ok(GET, reading(1))].map(since)],
      want: ["Conflict", [0, 0, 0, 1000, 2000, 2000]],
    };
  },
};
