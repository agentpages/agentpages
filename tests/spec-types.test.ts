import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { declaredNames, typeOfCell } from "./support/shapes.ts";
import { capabilityExample, type Exchange, hostRows, methodRows, toolRows, typeBlocks, typeOfExample } from "./support/spec.ts";
import { methodToolRows } from "./support/subjects.ts";

const folder = new URL("../reports/spec-types/", import.meta.url);

const TSCONFIG = {
  extends: "../../tsconfig.base.json",
  compilerOptions: {
    isolatedDeclarations: false,
    declaration: false,
    paths: { "@agentpages/protocol": ["../../packages/protocol/src/index.ts"] },
  },
  files: ["check.ts"],
};

/**
 * `Equal` holds only for identical types. `Flat` writes an intersection as one object, so that `A & { pageId }` can be
 * identical to a type that lists the same fields. `StandardSchemaV1` is copied from https://standardschema.dev.
 */
const PRELUDE = `
import type * as Protocol from "@agentpages/protocol";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Flat<T> = { [K in keyof T]: T[K] };
type McpUiCsp = Protocol.McpUiCsp;
type McpUiPermissions = Protocol.McpUiPermissions;
type JsonSchema = Protocol.JsonSchema;

interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => StandardResult<Output> | Promise<StandardResult<Output>>;
    readonly types?: { readonly input: Input; readonly output: Output } | undefined;
  };
}
type StandardResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<StandardIssue> };
interface StandardIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
}
export const standard = (schema: Protocol.Schema<Protocol.Commit>): StandardSchemaV1<unknown, Protocol.Commit> => schema;
`;

/** The spec writes "no fields" as `{}`. The package names that type `Empty`. */
const typeOf = (written: string): string => written.replaceAll(/\{\s*\}/gu, "Protocol.Empty");

const declarationCheck = (name: string): string => `export const ${name}Type: Equal<${name}, Protocol.${name}> = true;`;

const exchangeChecks = (registry: string) => ({ name, params, result }: Exchange, index: number): string[] => [
  `export const ${registry}${index}Params: Equal<Flat<${typeOf(typeOfCell(params))}>, Flat<Protocol.${registry}["${name}"]["params"]>> = true;`,
  `export const ${registry}${index}Result: Equal<Flat<${typeOf(typeOfCell(result))}>, Flat<Protocol.${registry}["${name}"]["result"]>> = true;`,
];

const source = [
  PRELUDE,
  typeBlocks,
  ...declaredNames.map(declarationCheck),
  ...methodRows.flatMap(exchangeChecks("Methods")),
  ...[...toolRows, ...methodToolRows].flatMap(exchangeChecks("Tools")),
  ...hostRows.flatMap(exchangeChecks("HostOperations")),
  `export const committed: Equal<Committed, Protocol.Notifications["agentpages/state/committed"]["params"]> = true;`,
  `export const capability: Equal<Flat<${typeOf(typeOfExample(capabilityExample))}>, Flat<Protocol.Capability>> = true;`,
].join("\n");

const typeErrors = (): string => {
  mkdirSync(folder, { recursive: true });
  writeFileSync(new URL("tsconfig.json", folder), JSON.stringify(TSCONFIG));
  writeFileSync(new URL("check.ts", folder), source);
  const compiler = fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url));
  return spawnSync(process.execPath, [compiler, "--project", fileURLToPath(folder)], { encoding: "utf8" }).stdout;
};

test("the exported types are the types the spec declares, and a schema is a Standard Schema", () => {
  expect(source).toContain("Equal<Document, Protocol.Document>");
  expect(source).toContain("Equal<Committed, Protocol.Committed>");
  expect(typeErrors()).toBe("");
});
