import type { Cancel, Committed, Heads, MethodName, Scope } from "@agentpages/protocol";
import { createChain } from "../chain.js";
import type { HostPorts, Serving } from "../types.js";
import { type Fetched, fetchedOf, type Position, positionsOf, readAnswer } from "./step.js";

const DEFAULT_INTERVAL_MS = 1000;

const COMMITS: MethodName = "agentpages/state/commits";

/** What the poll needs of the view it serves. */
export interface Followed {
  /** Whether the view may be sent commits now. */
  live(): boolean;
  send(committed: Committed): void;
}

interface Seen {
  comments?: number;
  sent: Map<Scope, number>;
}

/** Asks the Store for the heads of the page now, and again `intervalMs` after each answer, until cancelled. */
export const startPoll = ([serving, ports]: [Serving, HostPorts], view: Followed): Cancel => {
  const { url, link, on, intervalMs = DEFAULT_INTERVAL_MS } = serving;
  const chain = createChain(ports.timers);
  const seen: Seen = { sent: new Map() };
  const fetch = async (position: Position): Promise<Fetched> => {
    const { scope, since, head } = position;
    if (head <= since || !view.live()) return { commits: [], cursor: since };
    const params = { scope, since };
    return fetchedOf(position, await link.view({ method: COMMITS, params, url, requestId: ports.id() }));
  };
  const pump = async (position: Position): Promise<void> => {
    const { commits, cursor } = await fetch(position);
    if (chain.stopped()) return;
    commits.forEach((commit) => {
      view.send({ scope: position.scope, commit });
    });
    seen.sent.set(position.scope, cursor);
    if (cursor > position.since) await pump({ ...position, since: cursor });
  };
  const follow = async (heads: Heads): Promise<void> => {
    if (seen.comments !== undefined && seen.comments !== heads.comments) on({ kind: "comments", comments: heads.comments });
    seen.comments = heads.comments;
    await Promise.all(positionsOf(heads, seen.sent).map(pump));
  };
  const tick = async (): Promise<void> => {
    const answer = await link.host({ operation: "pages_heads", input: { url }, requestId: ports.id() });
    if (chain.stopped()) return;
    const read = readAnswer(answer, serving.version);
    if (read?.kind === "heads") await follow(read.heads);
    if (read?.kind === "end") on(read.event);
    else chain.after(intervalMs, tick);
  };
  void tick();
  return chain.stop;
};
