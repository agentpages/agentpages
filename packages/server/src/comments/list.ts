import type { CommentsListResult, Paging, Thread } from "@agentpages/protocol";
import type { Key, Reader, Value } from "@agentpages/storage";
import { NEED } from "../access/permits.js";
import type { Principal } from "../access/principal.js";
import { type Handler, list, ok, parsed, query } from "../pipeline/index.js";
import type { Arrival } from "../state/scope.js";
import { statusPrefix, threadsPrefix } from "./keys.js";

/** Where a list finds its threads: the rows it pages through, and the threads those rows stand for. */
interface Source {
  prefix: Key;
  threads: (tx: Reader, rows: [Key, Value][]) => Promise<(Value | undefined)[]>;
}

const everyThread = (pageId: string): Source => ({
  prefix: threadsPrefix(pageId),
  threads: (_, rows) => Promise.resolve(rows.map(([, stored]) => stored)),
});

const threadsOf = (pageId: string, status: Thread["status"]): Source => {
  const prefix = statusPrefix(pageId, status);
  return { prefix, threads: (tx, rows) => tx.getMany(rows.map(([key]) => `${threadsPrefix(pageId)}${key.slice(prefix.length)}`)) };
};

interface Listing extends Paging {
  status?: Thread["status"];
}

/** Section 5.4 of the spec: the threads of a page, or those of one status, oldest first. */
export const commentsList = <P extends Listing>(arrival: Arrival<P, CommentsListResult>): Handler<P, CommentsListResult, Principal> =>
  query(arrival.schemas, {
    target: arrival.page(NEED.read),
    run: async ({ params, target }, tx) => {
      const { pageId } = target.info;
      const source = params.status === undefined ? everyThread(pageId) : threadsOf(pageId, params.status);
      const { rows, next } = await list({ tx, prefix: source.prefix, paging: params });
      return ok(parsed(arrival.schemas.result, { threads: await source.threads(tx, rows), ...next }));
    },
  });
