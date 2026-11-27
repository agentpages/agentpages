import type { Driver } from "../contract.js";
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
  HOST_REQUEST,
  html,
  LINK_READ,
  LINK_WRITE,
  LIST,
  markup,
  openFails,
  opens,
  page,
  pageId,
  PRIVATE,
  PUBLISH,
  reading,
  refusedOpenId,
  type Session,
  SET_ACCESS,
  sharing,
  times,
  type,
  TYPE_PUBLISH,
  typed,
  VERSIONS,
  viewer,
  withPage,
} from "./kit.js";
import { after, COMMIT, COMMITS, committing, doc, listing, mine, STATE_GET, STATE_LIST, type Surface, viewOf } from "./surface.js";

const ACCESSES = [PRIVATE, LINK_READ, LINK_WRITE];

/** Page `n` of agent 1, with one version and this access. It returns the link of the page. */
const shared = async (alice: Session, [n, access]: [number, string]): Promise<string> => {
  await alice.ok(PUBLISH, page(n, 0));
  return (await alice.ok(SET_ACCESS, sharing(n, access))).url;
};

/**
 * What a signed-in link holder, an anonymous one, and the owner as a viewer with a link that is not current get, on
 * a page of each access.
 */
const acrossAccesses = (driver: Driver, ask: (surface: Surface) => Promise<unknown>): Promise<unknown[][]> => {
  const alice = actingAs(driver, agent(1));
  return Promise.all(
    ACCESSES.map(async (access, n) => {
      const url = await shared(alice, [n, access]);
      return Promise.all([viewer(2, url), anonymous(url), viewer(1, `${url}x`)].map((visit) => ask(viewOf(driver, visit))));
    }),
  );
};

const reads = (surface: Surface): Promise<string[]> =>
  Promise.all([surface.outcome(STATE_GET, doc("a")), surface.outcome(STATE_LIST, listing()), surface.outcome(COMMITS, after(0))]);

const ownScope = (surface: Surface): Promise<string[]> =>
  Promise.all([
    surface.outcome(COMMIT, mine(committing([]))),
    surface.outcome(STATE_GET, mine(doc("a"))),
    surface.outcome(STATE_LIST, mine(listing())),
    surface.outcome(COMMITS, mine(after(0))),
  ]);

export const STATE_ACCESS_CASES: Cases = {
  "[STATE-1] reading the page scope needs read access: the owner as a viewer has it, and a link holder with either link setting": async (driver) => ({
    got: await acrossAccesses(driver, reads),
    want: [
      [times(3, "Forbidden"), times(3, "Forbidden"), ["done", "done", "done"]],
      [["done", "done", "done"], ["done", "done", "done"], ["done", "done", "done"]],
      [["done", "done", "done"], ["done", "done", "done"], ["done", "done", "done"]],
    ],
  }),

  "[STATE-3] a commit to the page scope needs write access: the owner as a viewer has it, and a link holder with link-write": async (driver) => ({
    got: await acrossAccesses(driver, (surface) => surface.outcome(COMMIT, committing([]))),
    want: [
      ["Forbidden", "Forbidden", "done"],
      ["Forbidden", "Forbidden", "done"],
      ["done", "done", "done"],
    ],
  }),

  "[ACCESS-6] a signed-in viewer with read access reads and writes their own viewer scope": async (driver) => ({
    got: await acrossAccesses(driver, ownScope),
    want: [
      [times(4, "Forbidden"), times(4, "Forbidden"), ["done", "done", "done", "done"]],
      [["done", "done", "done", "done"], times(4, "Unauthenticated"), ["done", "done", "done", "done"]],
      [["done", "done", "done", "done"], times(4, "Unauthenticated"), ["done", "done", "done", "done"]],
    ],
  }),
};

export const ACCESS_CASES: Cases = {
  "[ACCESS-1] the owner does everything through the tools, whatever the access": async (driver) => {
    const alice = actingAs(driver, agent(1));
    const done = ACCESSES.map(async (access, n) => {
      await shared(alice, [n, access]);
      const read = [(await alice.ok(GET, reading(n))).access, (await alice.ok(PUBLISH, page(n, 1))).version];
      const { versions } = await alice.ok(VERSIONS, reading(n));
      return [...read, versions.length, await alice.ok(DELETE, deleting(n)), await alice.fails(GET, reading(n))];
    });
    return {
      got: await Promise.all(done),
      want: [
        ["private", 2, 2, {}, "NotFound"],
        ["link-read", 2, 2, {}, "NotFound"],
        ["link-write", 2, 2, {}, "NotFound"],
      ],
    };
  },

  "[ACCESS-2] any other MCP principal is refused, whatever the access": async (driver) => {
    const [alice, bob] = [actingAs(driver, agent(1)), actingAs(driver, agent(2))];
    const refused = ACCESSES.map(async (access, n) => {
      await shared(alice, [n, access]);
      const read = [bob.fails(GET, reading(n)), bob.fails(VERSIONS, reading(n))];
      const changed = [bob.fails(PUBLISH, page(n, 1)), bob.fails(DELETE, deleting(n)), bob.fails(SET_ACCESS, sharing(n, LINK_WRITE))];
      const errors = await Promise.all([...read, ...changed]);
      return [errors, (await alice.ok(GET, reading(n))).access];
    });
    return {
      got: [await Promise.all(refused), await bob.ok(LIST, {})],
      want: [ACCESSES.map((access) => [times(5, "Forbidden"), access]), { pages: [] }],
    };
  },

  "[ACCESS-8] a link holder presents the current url, which ends when the page becomes private": async (driver) => {
    const { alice } = await withPage(driver);
    const first = await alice.ok(SET_ACCESS, sharing(1, LINK_READ));
    const opened = [(await opens(driver, anonymous(first.url))).page, (await opens(driver, viewer(2, first.url))).page];
    const writable = await alice.ok(SET_ACCESS, sharing(1, LINK_WRITE));
    await alice.ok(SET_ACCESS, sharing(1, PRIVATE));
    const whilePrivate = [await openFails(driver, anonymous(first.url)), await openFails(driver, viewer(2, first.url))];
    const second = await alice.ok(SET_ACCESS, sharing(1, LINK_READ));
    const ended = [await openFails(driver, anonymous(first.url)), await openFails(driver, viewer(2, first.url))];
    const reopened = await opens(driver, viewer(2, second.url));
    return {
      got: [opened, writable.url, [...whilePrivate, ...ended], new Set([first.url, second.url]).size, reopened.page],
      want: [[first, first], first.url, times(4, "Forbidden"), 2, second],
    };
  },
};

export const HOST_CASES: Cases = {
  "[HOST-1] pages_open returns the page and what the host renders": async (driver) => {
    const alice = actingAs(driver, agent(1));
    await alice.ok(PUBLISH, having(page(1, 0), ["content", { ...html(1), ...guards(1) }]));
    const linked = await alice.ok(SET_ACCESS, sharing(1, LINK_READ));
    return {
      got: await opens(driver, anonymous(linked.url)),
      want: { page: linked, view: { html: markup(1), ...guards(1) } },
    };
  },

  "[HOST-3] the view is the page's own html, or that of its type version, with the type": async (driver) => {
    const alice = actingAs(driver, agent(1));
    const deck = await alice.ok(TYPE_PUBLISH, having(type(2, 0), ["content", { html: markup(2), ...guards(2) }]));
    const own = await alice.ok(PUBLISH, page(1, 0));
    const ofType = await alice.ok(PUBLISH, having(page(3, 0), ["content", typed(2, 1)]));
    return {
      got: [await opens(driver, viewer(1, own.url)), await opens(driver, viewer(1, ofType.url))],
      want: [
        { page: own, view: { html: markup(1) } },
        { page: ofType, view: { html: markup(2), ...guards(2) }, type: deck },
      ],
    };
  },

  "[HOST-4] a url that names no page is not found, and one that is not current opens only for the owner": async (driver) => {
    const { alice } = await withPage(driver);
    const stale = await alice.ok(SET_ACCESS, sharing(1, LINK_READ));
    await alice.ok(SET_ACCESS, sharing(1, PRIVATE));
    const current = await alice.ok(SET_ACCESS, sharing(1, LINK_READ));
    const nowhere = [stale.url.replace(pageId(1), pageId(2)), stale.url.replace(pageId(1), String(1)), stale.url.slice(1)];
    const notCurrent = [stale.url, `${current.url}x`];
    const strangers = notCurrent.flatMap((url) => [anonymous(url), viewer(2, url)]);
    const unnamed = await Promise.all(nowhere.map((url) => openFails(driver, anonymous(url))));
    const refused = await Promise.all(strangers.map((stranger) => openFails(driver, stranger)));
    const owned = await Promise.all(notCurrent.map((url) => opens(driver, viewer(1, url))));
    await alice.ok(DELETE, deleting(1));
    return {
      got: [unnamed, refused, owned.map((opened) => opened.page), await openFails(driver, anonymous(current.url))],
      want: [times(3, "NotFound"), times(4, "Forbidden"), [current, current], "NotFound"],
    };
  },

  "[REL-25] a failure of a host operation carries the requestId its host chose": async (driver) => {
    const { published } = await withPage(driver);
    return { got: await refusedOpenId(driver, anonymous(published.url)), want: HOST_REQUEST };
  },
};
