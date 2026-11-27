import type { Scope } from "@agentpages/protocol";
import { NEED, type Need } from "../access/permits.js";
import type { Principal } from "../access/principal.js";
import { rememberedBy } from "../pages/keys.js";
import type { Page } from "../pages/records.js";
import { ok, type Outcome, refuse, type Remembered, type Schemas, type Target } from "../pipeline/index.js";
import type { Key } from "@agentpages/storage";
import { pageScope, viewerScope } from "./keys.js";

export interface Scoped {
  scope: Scope;
}

/** How a state request arrives: with which schemas, and how it names its page. */
export interface Arrival<P, R> {
  schemas: Schemas<P, R>;
  page: (need: Need) => Target<P, Page>;
}

/** The scope a state request works in: its page, and what the keys of the scope start with. */
export interface Within {
  page: Page;
  scope: Key;
}

interface Asked {
  page: Page;
  scope: Scope;
  principal: Principal;
}

/** Section 5.3 of the spec: agents use the page scope only. Section 4.1: the viewer scope needs a signed-in viewer. */
const within = ({ page, scope, principal }: Asked): Outcome<Within> => {
  const { pageId } = page.info;
  if (scope === "page") return ok({ page, scope: pageScope(pageId) });
  if (principal.kind === "agent") return refuse({ error: "Forbidden", message: "An agent uses the page scope only." });
  if (principal.kind === "anonymous") {
    return refuse({ error: "Unauthenticated", message: "The viewer scope needs a signed-in viewer." });
  }
  return ok({ page, scope: viewerScope(pageId, principal.subject) });
};

/** Where the page of a scope keeps the requests it remembers. */
export const remembered = (_: unknown, { page }: Within): Remembered => rememberedBy(page.info.pageId);

/** What reading a scope needs of its page. */
export const toRead = (): Need => NEED.read;

/** What changing a scope needs of its page. A viewer's own scope is theirs to change once they can read the page. */
export const toChange = (scope: Scope): Need => (scope === "page" ? NEED.write : NEED.read);

/** The scope of a state request, on a page the caller has the access that `need` says the scope takes. */
export const scopeOf =
  <P extends Scoped, R>({ page }: Arrival<P, R>, need: (scope: Scope) => Need): Target<P, Within> =>
  (params, deps) => {
    const place = page(need(params.scope))(params, deps);
    return (
      place && {
        names: { ...place.names, scope: params.scope },
        locks: place.locks,
        find: async (request, tx) => {
          const found = await place.find(request, tx);
          return found.ok ? within({ page: found.value, scope: params.scope, principal: request.principal }) : found;
        },
      }
    );
  };
