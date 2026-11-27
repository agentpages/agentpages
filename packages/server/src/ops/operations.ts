import type { Capability, HostOperationName, HostOperations, MethodName, Methods, ToolName, Tools, ViewMethods } from "@agentpages/protocol";
import type { Agent, Visitor } from "../access/principal.js";
import { COMMENTS_HOST_OPERATIONS, COMMENTS_TOOLS } from "../comments/operations.js";
import { type FilesMethodHandlers, filesMethods, type FilesToolHandlers, filesTools } from "../files/operations.js";
import { identityGet } from "../identity/get.js";
import { PAGES_HOST_OPERATIONS } from "../pages/host.js";
import { PAGES_TOOLS } from "../pages/operations.js";
import type { Handler, Shown } from "../pipeline/index.js";
import { type StateMethodHandlers, stateMethods, type StateToolHandlers, stateTools } from "../state/operations.js";
import { TYPES_TOOLS } from "../types/operations.js";

/** Tools of later units. `call` answers them with "method not found" until their unit takes them off this list. */
type ToolNotYet =
  | "pages_render"
  | "pages_export";

/** Methods of later units, and the requests that go to a view and never to a Store. */
type MethodNotYet = keyof ViewMethods;

type Always<Name> = Exclude<
  Name,
  keyof StateToolHandlers | keyof StateMethodHandlers | keyof FilesToolHandlers | keyof FilesMethodHandlers | "agentpages/identity/get"
>;

type ToolHandlers = {
  readonly [T in Always<Exclude<ToolName, ToolNotYet>>]: Handler<Tools[T]["params"], Tools[T]["result"], Agent>;
} & Partial<StateToolHandlers> &
  Partial<FilesToolHandlers>;

type HostHandlers = {
  readonly [O in HostOperationName]: Handler<HostOperations[O]["params"], HostOperations[O]["result"], Visitor>;
};

type MethodHandlers = {
  readonly [M in Always<Exclude<MethodName, MethodNotYet>>]: Shown<Methods[M]["params"], Methods[M]["result"]>;
} & Partial<StateMethodHandlers> &
  Partial<FilesMethodHandlers> & { readonly "agentpages/identity/get"?: typeof identityGet };

/**
 * The tools of a Store that advertises `capability`. A tool that is neither here nor on the list above does not
 * compile, and the tools of a feature exist exactly when the Store advertises it.
 */
export const toolsOf = ({ state, files }: Capability): ToolHandlers => ({
  ...PAGES_TOOLS,
  ...TYPES_TOOLS,
  ...COMMENTS_TOOLS,
  ...(state && stateTools(state)),
  ...(files && filesTools(files)),
});

export const HOST_HANDLERS: HostHandlers = { ...PAGES_HOST_OPERATIONS, ...COMMENTS_HOST_OPERATIONS };

/** The view methods of a Store that advertises `capability`, by the same rules as its tools. */
export const methodsOf = ({ state, identity, files }: Capability): MethodHandlers => ({
  ...(state && stateMethods(state)),
  ...(files && filesMethods(files)),
  ...(identity && { "agentpages/identity/get": identityGet }),
});
