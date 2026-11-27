import type { Thread } from "@agentpages/protocol";
import type { Tx } from "@agentpages/storage";
import { NEED } from "../access/permits.js";
import type { Principal } from "../access/principal.js";
import { rememberedBy } from "../pages/keys.js";
import type { Page } from "../pages/records.js";
import { type Context, type Handler, mutation, type Outcome, refuse, type Target } from "../pipeline/index.js";
import type { Arrival } from "../state/scope.js";

type Entry = Thread["entries"][number];

/** The entry a request adds to a thread: its `opId` is the id, and its author the viewer, or nobody for an agent. */
export const entryOf = async ({ params, principal, target, at, deps }: Context<{ opId: string; body: string }, Page>): Promise<Entry> => ({
  id: params.opId,
  author: await deps.actors.viewerOf({ principal, pageId: target.info.pageId }),
  body: params.body,
  createdAt: at,
});

/** Section 5.4 of the spec: a viewer who may write is asked to sign in before they change a thread. */
const signedIn =
  <P>(target: Target<P, Page>): Target<P, Page> =>
  (params, deps) => {
    const place = target(params, deps);
    return (
      place && {
        ...place,
        find: async (request, tx) => {
          const found = await place.find(request, tx);
          return found.ok && request.principal.kind === "anonymous"
            ? refuse({ error: "Unauthenticated", message: "Changing a thread needs a signed-in viewer." })
            : found;
        },
      }
    );
  };

type Run<P> = (context: Context<P, Page>, tx: Tx) => Promise<Outcome<Thread>>;

/** An operation that changes a thread of a page the caller may write to, and returns the thread. */
export const commenting = <P extends { opId: string }>(arrival: Arrival<P, Thread>, run: Run<P>): Handler<P, Thread, Principal> =>
  mutation<P, Page, Thread, Principal>(arrival.schemas, {
    target: signedIn(arrival.page(NEED.write)),
    remembers: (_, page) => rememberedBy(page.info.pageId),
    run,
  });
