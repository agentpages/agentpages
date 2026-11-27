import type { Schema, Thread } from "@agentpages/protocol";
import type { Tx } from "@agentpages/storage";
import type { Principal } from "../access/principal.js";
import { toChange } from "../pages/arrival.js";
import type { Page } from "../pages/records.js";
import { type Context, countIn, type Handler, type Memory, mutation, type Outcome, parsed, refuse, type Target } from "../pipeline/index.js";
import type { Arrival } from "../state/scope.js";
import { findThread } from "./records.js";

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

export interface Comment<P> {
  /** The id of the thread the request starts or changes. */
  thread: (params: P) => string;
  run: (context: Context<P, Page>, tx: Tx) => Promise<Outcome<Thread>>;
}

interface Recalling<P> {
  result: Schema<Thread>;
  thread: (params: P) => string;
}

/**
 * A thread only gains entries, and all else of it but its status is as it was started. So the record of a request
 * keeps how many entries its thread had and its status, and a repeat gets the thread as it was then.
 */
const asItWas = <P>({ result, thread }: Recalling<P>): Memory<P, Page, Thread, Principal> => ({
  kept: ({ entries, status }) => ({ entries: entries.length, status }),
  recalled: async (tx, { kept, context: { params, target } }) => {
    const found = await findThread(tx, { pageId: target.info.pageId, id: thread(params) });
    return parsed(result, found && { ...found.thread, status: kept.status, entries: found.thread.entries.slice(0, countIn(kept, "entries")) });
  },
});

/** An operation that changes a thread of a page the caller may write to, and returns the thread. */
export const commenting = <P extends { opId: string }>(arrival: Arrival<P, Thread>, { thread, run }: Comment<P>): Handler<P, Thread, Principal> =>
  mutation<P, Page, Thread, Principal>(arrival.schemas, {
    remembers: toChange(arrival).remembers,
    target: signedIn(toChange(arrival).target),
    memory: asItWas({ result: arrival.schemas.result, thread }),
    run,
  });
