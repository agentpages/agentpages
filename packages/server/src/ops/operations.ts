import type { HostOperationName, HostOperations, ToolName, Tools } from "@agentpages/protocol";
import type { Agent, Visitor } from "../access/principal.js";
import { PAGES_HOST_OPERATIONS, PAGES_TOOLS } from "../pages/operations.js";
import type { Handler } from "../pipeline/operation.js";
import { TYPES_TOOLS } from "../types/operations.js";

/** Tools of later units. `call` answers them with "method not found" until their unit takes them off this list. */
type ToolNotYet =
  | "state_get"
  | "state_list"
  | "state_commit"
  | "state_commits"
  | "files_put"
  | "files_get"
  | "files_list"
  | "files_delete"
  | "comments_list"
  | "comments_reply"
  | "comments_resolve"
  | "pages_render"
  | "pages_export";

/** Host operations of later units, answered the same way. */
type HostOperationNotYet = "comments_start";

export type ToolReady = Exclude<ToolName, ToolNotYet>;

export type HostOperationReady = Exclude<HostOperationName, HostOperationNotYet>;

type ToolHandlers = { readonly [T in ToolReady]: Handler<Tools[T]["params"], Tools[T]["result"], Agent> };

type HostHandlers = {
  readonly [O in HostOperationReady]: Handler<HostOperations[O]["params"], HostOperations[O]["result"], Visitor>;
};

/** Every operation of the Store. A tool or host operation that is neither here nor on a list above does not compile. */
export const OPERATIONS: ToolHandlers & HostHandlers = { ...PAGES_TOOLS, ...TYPES_TOOLS, ...PAGES_HOST_OPERATIONS };
