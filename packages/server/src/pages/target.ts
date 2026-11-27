import { NEED, type Need, permits } from "../access/permits.js";
import type { Principal } from "../access/principal.js";
import { ok, type Outcome, type Place, refuse, type Target } from "../pipeline/index.js";
import type { Key } from "@agentpages/storage";
import { goneKey, metaKey } from "./keys.js";
import { type Page, pageOf } from "./records.js";
import { pageIdIn } from "./url.js";

interface PageId {
  pageId: string;
}

interface Entry<T> {
  need: Need;
  /** The page link the request presents. */
  link?: string;
  /** What the request finds where no page is. */
  absent: () => Outcome<T>;
}

const missing = (): Outcome<never> => refuse({ error: "NotFound", message: "The page does not exist." });

const none = (): Outcome<null> => ok(null);

/** The page with this `pageId`, for a caller who has the access the operation needs. */
const pageAt = <P, T = never>(pageId: string, { absent, ...asked }: Entry<T>): Place<P, Page | T, Principal> => ({
  names: { pageId },
  locks: [metaKey(pageId)],
  find: async ({ principal }, tx) => {
    const stored = await tx.get(metaKey(pageId));
    if (stored === undefined) return absent();
    const page = pageOf(stored);
    return permits({ ...asked, principal, page: { ...page.info, owner: page.owner } })
      ? ok(page)
      : refuse({ error: "Forbidden", message: `The caller has no ${asked.need} access to the page.` });
  },
});

/** A page that must exist. */
export const existingPage =
  <P extends PageId>(need: Need): Target<P, Page> =>
  ({ pageId }) =>
    pageAt(pageId, { need, absent: missing });

/** The page a view shows: the one the link its host holds names, for a viewer who presents that link. */
export const shownPage =
  (url: string) =>
  <P>(need: Need): Target<P, Page> =>
  (_, { baseUrl }) => {
    const pageId = pageIdIn(url, baseUrl);
    return pageId === undefined ? undefined : pageAt(pageId, { need, link: url, absent: missing });
  };

/** The page a `url` of this Store names, for a caller who presents that `url`. */
export const linkedPage =
  <P extends { url: string }>(need: Need): Target<P, Page> =>
  (params, deps) =>
    shownPage(params.url)<P>(need)(params, deps);

/** The page of `pages_delete`, which may be gone already. */
export const removablePage =
  <P extends PageId>(): Target<P, Page | null> =>
  ({ pageId }) =>
    pageAt(pageId, { need: NEED.owner, absent: none });

/**
 * The page of `pages_publish`, which the request may create. A deleted `pageId` is never used again, and whatever
 * else the request names, such as the version of a type, must exist too.
 */
export const publishablePage =
  <P extends PageId>(alsoNamed: (params: P) => Key[]): Target<P, Page | null> =>
  (params) => {
    const page = pageAt<P, null>(params.pageId, { need: NEED.owner, absent: none });
    return {
      ...page,
      find: async (request, tx) => {
        const [gone, ...named] = await tx.getMany([goneKey(params.pageId), ...alsoNamed(params)]);
        return gone !== undefined || named.includes(undefined)
          ? refuse({ error: "NotFound", message: "The page was deleted, or the type version it names does not exist." })
          : page.find(request, tx);
      },
    };
  };
