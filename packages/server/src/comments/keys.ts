import type { Thread } from "@agentpages/protocol";
import type { Key } from "@agentpages/storage";
import { pagePrefix } from "../pages/keys.js";

/** Where a thread is among the threads of its page: they are in the order of when each was started, then of their ids. */
export interface Spot {
  pageId: string;
  id: string;
  /** When the first entry of the thread was made. */
  createdAt: string;
}

const commentsPrefix = (pageId: string): Key => `${pagePrefix(pageId)}k/`;

/** What a list returns of a thread, and the cursor that leads on from it. */
const placeOf = ({ createdAt, id }: Spot): string => `${createdAt}/${id}`;

/** The threads of a page, in the order `comments_list` returns them. */
export const threadsPrefix = (pageId: string): Key => `${commentsPrefix(pageId)}t/`;

/** A thread. It is kept here and nowhere else. */
export const threadKey = (spot: Spot): Key => `${threadsPrefix(spot.pageId)}${placeOf(spot)}`;

/** When a thread was started, by its id. It never changes. */
export const spotKey = ({ pageId, id }: Pick<Spot, "pageId" | "id">): Key => `${commentsPrefix(pageId)}i/${id}`;

/** The threads of a page that have one status, in the same order, under what `threadKey` has after its prefix. */
export const statusPrefix = (pageId: string, status: Thread["status"]): Key => `${commentsPrefix(pageId)}s/${status}/`;

export const statusKey = (spot: Spot, status: Thread["status"]): Key => `${statusPrefix(spot.pageId, status)}${placeOf(spot)}`;

/** How often the threads of a page changed. */
export const headKey = (pageId: string): Key => `${commentsPrefix(pageId)}head`;
