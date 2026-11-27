import type { CommentsTools } from "../comments/tools.js";
import type { Feature } from "../extension/constants.js";
import type { ToolsOf } from "../extension/names.js";
import type { FilesMethods } from "../files/methods.js";
import type { PagesTools } from "../pages/tools.js";
import type { RenderTools } from "../render/tools.js";
import type { StateMethods } from "../state/methods.js";
import type { TypesTools } from "../types/tools.js";
import type { Mutates } from "./methods.js";

/** Every tool of a Store. */
export interface Tools extends ToolsOf<StateMethods>, ToolsOf<FilesMethods>, PagesTools, CommentsTools, RenderTools, TypesTools {}

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
