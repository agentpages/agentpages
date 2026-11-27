import { type Empty, type IdentityGetResult, METHOD_SCHEMAS } from "@agentpages/protocol";
import { viewerOf } from "../access/actor.js";
import { NEED } from "../access/permits.js";
import type { Visitor } from "../access/principal.js";
import type { Page } from "../pages/records.js";
import { shownPage } from "../pages/target.js";
import { ok, query, type Shown } from "../pipeline/index.js";

/** `identity/get` of the view that shows the page behind `url`. Whoever can read the page can ask who they are. */
export const identityGet: Shown<Empty, IdentityGetResult> = (url) =>
  query<Empty, Page, IdentityGetResult, Visitor>(METHOD_SCHEMAS["agentpages/identity/get"], {
    target: shownPage(url)(NEED.read),
    run: async ({ principal }) => ok({ viewer: await viewerOf(principal) }),
  });
