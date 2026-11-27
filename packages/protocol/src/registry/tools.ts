import type { CommentsTools } from "../comments/tools.js";
import { type Feature, METHOD_PREFIX } from "../extension/constants.js";
import type { FilesMethods } from "../files/methods.js";
import type { PagesTools } from "../pages/tools.js";
import type { RenderTools } from "../render/tools.js";
import type { StateMethods } from "../state/methods.js";
import type { TypesTools } from "../types/tools.js";
import type { Methods, Mutates } from "./methods.js";

/** The view methods a Store also exposes as tools. */
export type StoreMethodName = keyof StateMethods | keyof FilesMethods;

export type Underscored<Path extends string> = Path extends `${infer Head}/${infer Tail}`
  ? `${Head}_${Underscored<Tail>}`
  : Path;

export type ToolNameOf<M extends string> = M extends `${typeof METHOD_PREFIX}${infer Path}` ? Underscored<Path> : never;

/** The tool name of a view method: drop `agentpages/`, then replace `/` with `_`. */
export function toolName<M extends StoreMethodName>(method: M): ToolNameOf<M>;
export function toolName(method: string): string {
  return method.slice(METHOD_PREFIX.length).replaceAll("/", "_");
}

export type MethodTools = {
  [M in StoreMethodName as ToolNameOf<M>]: {
    params: Methods[M]["params"] & { pageId: string };
    result: Methods[M]["result"];
  };
};

/** Every tool of a Store. */
export interface Tools extends MethodTools, PagesTools, CommentsTools, RenderTools, TypesTools {}

export type ToolName = keyof Tools;

export interface ToolInfo<T extends ToolName> {
  /** The Store lists the tool exactly when it advertises all of these. */
  readonly requires: readonly Feature[];
  readonly mutates: Mutates<Tools[T]["params"]>;
}

export const TOOLS: { readonly [T in ToolName]: ToolInfo<T> } = {
  pages_publish: { requires: [], mutates: true },
  pages_get: { requires: [], mutates: false },
  pages_list: { requires: [], mutates: false },
  pages_versions: { requires: [], mutates: false },
  pages_set_access: { requires: [], mutates: true },
  pages_delete: { requires: [], mutates: true },
  state_get: { requires: ["state"], mutates: false },
  state_list: { requires: ["state"], mutates: false },
  state_commit: { requires: ["state"], mutates: true },
  state_commits: { requires: ["state"], mutates: false },
  files_put: { requires: ["files"], mutates: true },
  files_get: { requires: ["files"], mutates: false },
  files_list: { requires: ["files"], mutates: false },
  files_delete: { requires: ["files"], mutates: true },
  comments_list: { requires: [], mutates: false },
  comments_reply: { requires: [], mutates: true },
  comments_resolve: { requires: [], mutates: true },
  pages_render: { requires: ["render"], mutates: false },
  pages_export: { requires: ["render", "files"], mutates: true },
  types_publish: { requires: [], mutates: true },
  types_get: { requires: [], mutates: false },
  types_list: { requires: [], mutates: false },
};
