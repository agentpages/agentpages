import type { Answer, Capability, HostRequest, Port, Timers, ViewRequest } from "@agentpages/protocol";

/** The way to the Store, for one viewer. Neither function rejects: a transport failure is `Unavailable`. */
export interface Link {
  /** A host operation for the viewer. */
  host(request: HostRequest): Promise<Answer>;
  /** A method the view called. */
  view(request: ViewRequest): Promise<Answer>;
}

/** What the shell around a view must act on. */
export type HostEvent =
  | { kind: "version"; version: number }
  | { kind: "closed"; error: "NotFound" | "Forbidden" }
  | { kind: "comments"; comments: number }
  | { kind: "unresponsive" };

export interface Serving {
  /** The link the viewer presented. Sent to the Store, never to the view. */
  url: string;
  /** The version the view shows. */
  version: number;
  /** The capability of the Store. */
  capability: Capability;
  link: Link;
  /**
   * `version`: mount the new version. `closed`: close the view. `comments`: list the threads again. `unresponsive`:
   * offer a reload. After `version` or `closed` the host no longer asks the Store for changes.
   */
  on: (event: HostEvent) => void;
  /** How long the host waits between two `pages_heads`. Default 1000. */
  intervalMs?: number;
}

export interface HostPorts {
  /** The channel to the view. */
  port: Port;
  timers: Timers;
  /** A new id of section 2.1 of the spec on every call: a `requestId`, or the `id` of a request to the view. */
  id: () => string;
}

export interface Mounted {
  /**
   * Stops asking the Store, sends `ui/resource-teardown` to a view that is initialized and responsive, waits for its
   * answer at most `requestTimeoutMs`, then stops listening. A second call does nothing more.
   */
  close(): Promise<void>;
}
