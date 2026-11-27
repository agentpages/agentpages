import type { Capability, FilesMethods, HostOperationName, HostOperations, MethodName, Methods, ToolName, Tools, ViewMethods } from "@agentpages/protocol";
import type { Agent, Visitor } from "../access/principal.js";
import { identityGet } from "../identity/get.js";
import { PAGES_HOST_OPERATIONS, PAGES_TOOLS } from "../pages/operations.js";
import type { Handler, Shown } from "../pipeline/index.js";
import { type StateMethodHandlers, stateMethods, type StateToolHandlers, stateTools } from "../state/operations.js";
import { TYPES_TOOLS } from "../types/operations.js";

/** Tools of later units. `call` answers them with "method not found" until their unit takes them off this list. */
type ToolNotYet =
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

/** Methods of later units, and the requests that go to a view and never to a Store. */
type MethodNotYet = keyof FilesMethods | keyof ViewMethods;

type Always<Name> = Exclude<Name, keyof StateToolHandlers | keyof StateMethodHandlers | "agentpages/identity/get">;

type ToolHandlers = {
  readonly [T in Always<Exclude<ToolName, ToolNotYet>>]: Handler<Tools[T]["params"], Tools[T]["result"], Agent>;
} & Partial<StateToolHandlers>;

type HostHandlers = {
  readonly [O in Exclude<HostOperationName, HostOperationNotYet>]: Handler<HostOperations[O]["params"], HostOperations[O]["result"], Visitor>;
};

type MethodHandlers = {
  readonly [M in Always<Exclude<MethodName, MethodNotYet>>]: Shown<Methods[M]["params"], Methods[M]["result"]>;
} & Partial<StateMethodHandlers> & { readonly "agentpages/identity/get"?: typeof identityGet };

/**
 * The tools of a Store that advertises `capability`. A tool that is neither here nor on the list above does not
 * compile, and the tools of a feature exist exactly when the Store advertises it.
 */
export const toolsOf = ({ state }: Capability): ToolHandlers => ({ ...PAGES_TOOLS, ...TYPES_TOOLS, ...(state && stateTools(state)) });

export const HOST_HANDLERS: HostHandlers = PAGES_HOST_OPERATIONS;

/** The view methods of a Store that advertises `capability`, by the same rules as its tools. */
export const methodsOf = ({ state, identity }: Capability): MethodHandlers => ({
  ...(state && stateMethods(state)),
  ...(identity && { "agentpages/identity/get": identityGet }),
});
