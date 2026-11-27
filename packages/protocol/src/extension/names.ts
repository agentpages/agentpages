import type { Exchange } from "../common/types.js";

export const METHOD_PREFIX = "agentpages/";

export type Underscored<Path extends string> = Path extends `${infer Head}/${infer Tail}`
  ? `${Head}_${Underscored<Tail>}`
  : Path;

export type ToolNameOf<M extends string> = M extends `${typeof METHOD_PREFIX}${infer Path}` ? Underscored<Path> : never;

/** The tools a Store exposes for view methods: the same params plus `pageId`, and the same result. */
export type ToolsOf<M> = {
  [K in keyof M & string as ToolNameOf<K>]: M[K] extends Exchange
    ? { params: M[K]["params"] & { pageId: string }; result: M[K]["result"] }
    : never;
};

/** The tool name of a view method: drop `agentpages/`, then replace `/` with `_`. */
export function toolName<M extends string>(method: M): ToolNameOf<M>;
export function toolName(method: string): string {
  return method.slice(METHOD_PREFIX.length).replaceAll("/", "_");
}
