import { type Thread, TOOL_SCHEMAS } from "@agentpages/protocol";
import type { Reader, Tx, Value } from "@agentpages/storage";
import { countIn, parsed, recordOf } from "../pipeline/index.js";
import { headKey, type Spot, spotKey, statusKey, threadKey } from "./keys.js";

/** How often the threads of a page changed, as a row keeps it. */
export const changesIn = (head: Value | undefined): number => countIn(head, "count");

/** A thread as a request finds it. */
export interface Found {
  spot: Spot;
  thread: Thread;
  /** How often the threads of the page changed before the request. */
  changes: number;
}

/** The thread of a page with this id. Nothing when the page has none. */
export const findThread = async (tx: Reader, named: Pick<Spot, "pageId" | "id">): Promise<Found | undefined> => {
  const started = await tx.get(spotKey(named));
  if (started === undefined) return undefined;
  const spot = { ...named, createdAt: String(recordOf(started).createdAt) };
  const [stored, head] = await tx.getMany([threadKey(spot), headKey(named.pageId)]);
  return { spot, thread: parsed(TOOL_SCHEMAS.comments_reply.result, stored), changes: changesIn(head) };
};

const OTHER = { open: "resolved", resolved: "open" } as const;

/** Saves a thread as a start, a reply or a resolve left it, among the threads of its status, and counts the change. */
export const saveThread = (tx: Tx, { spot, thread, changes }: Found): void => {
  tx.put(threadKey(spot), { ...thread });
  tx.delete(statusKey(spot, OTHER[thread.status]));
  tx.put(statusKey(spot, thread.status), {});
  tx.put(headKey(spot.pageId), { count: changes + 1 });
};
