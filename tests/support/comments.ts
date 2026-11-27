import { type Answer, HOST_OPERATION_SCHEMAS, type Thread } from "@agentpages/protocol";
import { HOST_REQUEST, op, PAGE, resultOf, sharedPage, type World } from "./store.ts";

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

/** A `pages_heads` of a host, for an anonymous viewer who presents `url`. */
export const heads = (target: World, url: string): Promise<Answer> =>
  target.host({ operation: "pages_heads", input: { url }, principal: { kind: "anonymous" }, requestId: HOST_REQUEST });
