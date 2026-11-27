import { type Cancel, type Peer, PING, type Timers } from "@agentpages/protocol";
import { createChain } from "../chain.js";

export interface Pinging {
  peer: Peer;
  timers: Timers;
  /** How long an answer may take, and how long the host waits after one before it asks again. */
  timeoutMs: number;
  /** Called once, when a ping got no answer in time. No ping follows it. */
  lost: () => void;
}

/** Pings the view now, and again `timeoutMs` after each answer, until cancelled or until no answer comes (REL-23). */
export const startPings = ({ peer, timers, timeoutMs, lost }: Pinging): Cancel => {
  const chain = createChain(timers);
  const ping = async (): Promise<void> => {
    const reply = await peer.request({ method: PING, timeoutMs });
    if (chain.stopped()) return;
    if (reply.kind === "timeout") lost();
    else chain.after(timeoutMs, ping);
  };
  void ping();
  return chain.stop;
};
