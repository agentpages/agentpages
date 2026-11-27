import { type CommentsListResult, HOST_OPERATION_SCHEMAS, type PageInfo, type Thread, TOOL_SCHEMAS, type Viewer } from "@agentpages/protocol";
import type { Driver } from "../contract.js";
import { agent, HOST_REQUEST, inTurn, LINK_WRITE, opId, reading, type Session, SET_ACCESS, sharing, text, viewer, type Visit, withPage } from "./kit.js";
import { type StateOp, type Surface, surfaceOf } from "./surface.js";

export const START: StateOp<Thread> = { name: "comments_start", result: HOST_OPERATION_SCHEMAS.comments_start.result };
export const THREADS: StateOp<CommentsListResult> = { name: "comments_list", result: TOOL_SCHEMAS.comments_list.result };
export const REPLY: StateOp<Thread> = { name: "comments_reply", result: TOOL_SCHEMAS.comments_reply.result };
export const RESOLVE: StateOp<Thread> = { name: "comments_resolve", result: TOOL_SCHEMAS.comments_resolve.result };

/** The comments tools of agent `by`, on page `on`. */
export const commentsOf = (driver: Driver, { by, on }: { by: number; on: number }): Surface =>
  surfaceOf(({ name }, params) => driver.call({ tool: name, input: Object.assign({}, params, reading(on)), subject: agent(by) }));

/** The comments operations of a host, for a viewer who presents a link. The link is the `url` of every request. */
export const hostOf = (driver: Driver, { url, ...shown }: Visit): Surface =>
  surfaceOf(({ name }, params) => driver.host({ operation: name, input: Object.assign({}, params, { url }), viewer: shown, requestId: HOST_REQUEST }));

export interface Saying {
  opId: string;
  body: string;
}

/** The params that start a thread, or say something in one, with text `n` and an `opId` of their own. */
export const saying = (n: number): Saying => ({ opId: opId(), body: text(n) });

/** The params that answer a thread with text `n`. */
export const replying = (threadId: string, n: number): Saying & { threadId: string } => ({ ...saying(n), threadId });

/** The params that resolve a thread. */
export const resolving = (threadId: string): { opId: string; threadId: string } => ({ opId: opId(), threadId });

/** What `each` makes of every item, one after the other. */
export const collected = async <T, R>(items: readonly T[], each: (item: T) => Promise<R>): Promise<R[]> => {
  const made: R[] = [];
  await inTurn(items, async (item) => made.push(await each(item)));
  return made;
};

/** Who the Store says wrote each entry of a thread. */
export const authorsOf = (thread: Thread): (Viewer | null)[] => thread.entries.map((entry) => entry.author);

/** The ids of the threads of a list. */
export const idsOf = ({ threads }: CommentsListResult): string[] => threads.map((thread) => thread.id);

/** An entry of an agent. */
export const byAgent = ({ opId: id, body }: Saying, createdAt: string): Thread["entries"][number] => ({ id, author: null, body, createdAt });

export interface Scene {
  alice: Session;
  published: PageInfo;
  /** The link of the page. */
  url: string;
  /** The comments tools of the owner. */
  owner: Surface;
  /** The host of viewer 2, who holds the link. */
  bob: Surface;
}

/** Page 1 of agent 1, shared for writing. The clock stands where it stood when the page was published. */
export const scene = async (driver: Driver): Promise<Scene> => {
  const { alice, published } = await withPage(driver);
  const { url } = await alice.ok(SET_ACCESS, sharing(1, LINK_WRITE));
  return { alice, published, url, owner: commentsOf(driver, { by: 1, on: 1 }), bob: hostOf(driver, viewer(2, url)) };
};
