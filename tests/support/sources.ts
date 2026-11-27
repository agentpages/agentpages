import { registerHooks } from "node:module";

const PACKAGE = /^@agentpages\/(?<name>.+)$/u;

/** Where a process that runs the TypeScript sources finds what a specifier names. */
const sourceOf = (specifier: string): string => {
  const name = PACKAGE.exec(specifier)?.groups?.name;
  return name === undefined
    ? specifier.replace(/^(?<path>\..*)\.js$/u, "$<path>.ts")
    : new URL(`../../packages/${name}/src/index.ts`, import.meta.url).href;
};

registerHooks({ resolve: (specifier, ...[context, next]) => next(sourceOf(specifier), context) });
