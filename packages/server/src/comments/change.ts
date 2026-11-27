import type { Thread } from "@agentpages/protocol";
import type { Principal } from "../access/principal.js";
import type { Page } from "../pages/records.js";
import { type Context, type Handler, ok, type Outcome, refuse } from "../pipeline/index.js";
import type { Arrival } from "../state/scope.js";
import { findThread, saveThread } from "./records.js";
import { commenting, entryOf } from "./write.js";

interface Naming {
  opId: string;
  threadId: string;
}

/** What a request makes of the thread it names. */
type Change<P> = (context: Context<P, Page>, thread: Thread) => Promise<Outcome<Thread>>;

/** An operation on a thread the page has. Section 5.4 of the spec: one it does not have is not found. */
const changing = <P extends Naming>(arrival: Arrival<P, Thread>, change: Change<P>): Handler<P, Thread, Principal> =>
  commenting(arrival, {
    thread: ({ threadId }) => threadId,
    run: async (context, tx) => {
      const found = await findThread(tx, { pageId: context.target.info.pageId, id: context.params.threadId });
      if (found === undefined) return refuse({ error: "NotFound", message: "The page has no thread with this threadId." });
      const changed = await change(context, found.thread);
      if (changed.ok) saveThread(tx, { ...found, thread: changed.value });
      return changed;
    },
  });

/**
 * Section 5.4 of the spec: one more entry, on a thread that is open again. An `opId` that is an entry already is
 * decided before the limit, as section 2.1 orders the two.
 */
export const commentsReply = <P extends Naming & { body: string }>(arrival: Arrival<P, Thread>): Handler<P, Thread, Principal> =>
  changing(arrival, async (context, thread) => {
    const { maxThreadEntries } = context.deps.capability.limits;
    if (thread.entries.some(({ id }) => id === context.params.opId)) {
      return refuse({ error: "InvalidParams", message: "This opId is already the id of an entry of the thread." });
    }
    if (thread.entries.length >= maxThreadEntries) {
      return refuse({ error: "LimitExceeded", message: `A thread has at most ${maxThreadEntries} entries.` });
    }
    return ok({ ...thread, status: "open", entries: [...thread.entries, await entryOf(context)] });
  });

export const commentsResolve = <P extends Naming>(arrival: Arrival<P, Thread>): Handler<P, Thread, Principal> =>
  changing(arrival, (_, thread) => Promise.resolve(ok({ ...thread, status: "resolved" })));
