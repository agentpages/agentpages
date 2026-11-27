/**
 * Who makes a request, as the transport established it. Agents and viewers share one namespace of subjects, so the
 * owner of a page is the same subject in either role.
 */
export type Principal =
  | { kind: "agent"; subject: string }
  | { kind: "viewer"; subject: string; name?: string }
  | { kind: "anonymous" };

/** An MCP principal: the caller of a Store tool. */
export type Agent = Extract<Principal, { kind: "agent" }>;

/** Whom a host acts for. */
export type Visitor = Exclude<Principal, Agent>;
