import type { Thread } from "@agentpages/protocol";
import type { Principal } from "../access/principal.js";
import { type Handler, ok, parsed, refuse } from "../pipeline/index.js";
import type { Arrival } from "../state/scope.js";
import { headKey, spotKey } from "./keys.js";
import { changesIn, saveThread } from "./records.js";
import { commenting, entryOf } from "./write.js";

interface Starting {
  opId: string;
  quote?: string;
  body: string;
}

/** Section 5.6 of the spec: a new thread on the current version of the page, under the `opId` of its request. */
export const commentsStart = <P extends Starting>(arrival: Arrival<P, Thread>): Handler<P, Thread, Principal> =>
  commenting(arrival, {
    thread: ({ opId }) => opId,
    run: async (context, tx) => {
      const { params, target, at } = context;
      const { pageId, version } = target.info;
      const spot = { pageId, id: params.opId, createdAt: at };
      const [taken, head] = await tx.getMany([spotKey(spot), headKey(pageId)]);
      if (taken !== undefined) return refuse({ error: "InvalidParams", message: "This opId is already the id of a thread of the page." });
      const first = { ...params, id: spot.id, pageId, version, status: "open", entries: [await entryOf(context)] };
      const thread = parsed(arrival.schemas.result, first);
      tx.put(spotKey(spot), { createdAt: at });
      saveThread(tx, { spot, thread, changes: changesIn(head) });
      return ok(thread);
    },
  });
