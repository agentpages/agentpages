import { type Answer, HOST_OPERATION_SCHEMAS, type Thread, TOOL_SCHEMAS } from "@agentpages/protocol";
import type { Storage } from "@agentpages/storage";
import { call, HOST_REQUEST, op, PAGE, publishing, resultOf, saved, sharedPage, type World } from "./store.ts";

export interface Commenting {
  operation: string;
  /** The signed-in viewer the host acts for. */
  subject: string;
  name?: string;
  input: Record<string, unknown>;
}

/** A comments operation of a host, for a signed-in viewer. */
export const comment = (target: World, { operation, input, ...viewer }: Commenting): Promise<Answer> =>
  target.host({ operation, input, principal: { kind: "viewer", ...viewer }, requestId: HOST_REQUEST });

/** The thread of an answer that must be one. */
export const threadOf = (answer: Answer): Thread => resultOf(HOST_OPERATION_SCHEMAS.comments_start.result, answer);

/** The id of the thread of `withThread`. */
export const THREAD: string = op(3);

/** A Store with `PAGE` shared for writing, and a thread bob started on it. */
export const withThread = async (): Promise<{ target: World; url: string; thread: Thread }> => {
  const { target, url } = await sharedPage();
  const started = await comment(target, { operation: "comments_start", subject: "bob", input: { opId: THREAD, url, body: "First" } });
  return { target, url, thread: threadOf(started) };
};

/** A `comments_reply` of alice's to the thread of `withThread`. */
export const REPLY: [string, unknown] = ["comments_reply", { opId: op(4), pageId: PAGE, threadId: THREAD, body: "Second" }];

/** A `comments_resolve` of alice's of the thread of `withThread`. */
export const resolved = (opNumber: number): [string, unknown] => ["comments_resolve", { opId: op(opNumber), pageId: PAGE, threadId: THREAD }];

/** Every count the Store keeps of how often the threads of a page changed, in the order of the pages. */
export const threadCounts = async (storage: Storage): Promise<unknown[]> => {
  const rows = await storage.scan({ prefix: "", limit: Number.MAX_SAFE_INTEGER });
  return rows.flatMap(([, value]) => ("count" in value ? [value.count] : []));
};

/** Everything the Store has saved, as one text. */
export const savedText = async (storage: Storage): Promise<string> => JSON.stringify(await saved(storage));

/** Publishes a second page of alice's, on which she starts a thread as a viewer. */
export const startElsewhere = async (target: World): Promise<Answer> => {
  const other = await call(target, ["pages_publish", publishing({ page: 2, baseVersion: 0, op: 9 })]);
  const { url } = resultOf(TOOL_SCHEMAS.pages_publish.result, other);
  return comment(target, { operation: "comments_start", subject: "alice", input: { opId: op(10), url, body: "Elsewhere" } });
};
