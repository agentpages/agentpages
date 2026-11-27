import { type Cancel, createPeer, type NotificationName, type TeardownParams, UI_INITIALIZED, UI_TEARDOWN } from "@agentpages/protocol";
import { startPoll } from "../heads/poll.js";
import { startPings } from "../liveness/ping.js";
import type { HostPorts, Mounted, Serving } from "../types.js";
import { answering } from "./requests.js";

const COMMITTED: NotificationName = "agentpages/state/committed";

const TEARDOWN: TeardownParams = { reason: "closed" };

interface View {
  status: "connecting" | "ready" | "unresponsive";
  stopPings: Cancel;
  closed?: Promise<void>;
}

/** Serves one view of one page for one viewer over `ports`, until closed. */
export const serve = (serving: Serving, ports: HostPorts): Mounted => {
  const { capability, on } = serving;
  const timeoutMs = capability.limits.requestTimeoutMs;
  const view: View = { status: "connecting", stopPings: () => {} };
  const lost = (): void => {
    view.status = "unresponsive";
    on({ kind: "unresponsive" });
  };
  const begin = (): void => {
    if (view.status !== "connecting") return;
    view.status = "ready";
    view.stopPings = startPings({ peer, timers: ports.timers, timeoutMs, lost });
  };
  const peer = createPeer(ports, {
    request: answering(serving, ports),
    notification: ({ method }) => {
      if (method === UI_INITIALIZED) begin();
    },
  });
  const stopPoll = startPoll([serving, ports], {
    live: () => capability.state?.liveChanges === true && (view.status === "ready" || view.status === "unresponsive"),
    send: (params) => {
      peer.notify({ method: COMMITTED, params });
    },
  });
  const close = async (): Promise<void> => {
    stopPoll();
    view.stopPings();
    if (view.status === "ready") await peer.request({ method: UI_TEARDOWN, params: TEARDOWN, timeoutMs });
    peer.close();
  };
  return {
    close: () => {
      view.closed ??= close();
      return view.closed;
    },
  };
};
