import type { Answer, Capability } from "@agentpages/protocol";

/** A viewer a host acts for: who they are when they are signed in. The link they present is the input of a request. */
export interface Viewing {
  subject?: string;
}

/** A Store as the suite drives it. */
export interface Driver {
  capability: Capability;
  /** A tool call of the agent with this subject. */
  call(request: { tool: string; input: unknown; subject: string }): Promise<Answer>;
  /** An operation a host runs for a viewer, under the `requestId` the host chose. */
  host(request: { operation: string; input: unknown; viewer: Viewing; requestId: string }): Promise<Answer>;
  /** Moves the Store's clock forward by exactly `ms`. */
  advance(ms: number): void;
}
