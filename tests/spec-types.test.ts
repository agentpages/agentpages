import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { declaredNames, typeOfCell } from "./support/shapes.ts";
import { capabilityExample, type Exchange, methodRows, toolRows, typeBlocks } from "./support/spec.ts";
import { methodToolRows } from "./support/subjects.ts";
import { isObject } from "./support/values.ts";

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

const PRELUDE = `
import type * as Protocol from "@agentpages/protocol";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type McpUiCsp = Protocol.McpUiCsp;
type McpUiPermissions = Protocol.McpUiPermissions;
type JsonSchema = Protocol.JsonSchema;
`;

const declarationCheck = (name: string): string => `export const ${name}Type: Equal<${name}, Protocol.${name}> = true;`;

const exchangeChecks = (registry: string) => ({ name, params, result }: Exchange, index: number): string[] => [
  `export const ${registry}${index}Params: Same<${typeOfCell(params)}, Protocol.${registry}["${name}"]["params"]> = true;`,
  `export const ${registry}${index}Result: Same<${typeOfCell(result)}, Protocol.${registry}["${name}"]["result"]> = true;`,
];

const TYPES: Record<string, string> = { string: "string", number: "number", boolean: "boolean" };

/** The type of a JSON example, where every feature of a capability may be absent. */
const typeOfExample = (value: unknown, optional = /^(?:state|identity|files|render)$/u): string =>
  isObject(value)
    ? `{ ${Object.entries(value)
        .map(([key, child]) => `${key}${optional.test(key) ? "?" : ""}: ${typeOfExample(child, /^$/u)}`)
        .join("; ")} }`
    : (TYPES[typeof value] ?? "never");

const source = [
  PRELUDE,
  typeBlocks,
  ...declaredNames.map(declarationCheck),
  ...methodRows.flatMap(exchangeChecks("Methods")),
  ...[...toolRows, ...methodToolRows].flatMap(exchangeChecks("Tools")),
  `export const capability: Same<${typeOfExample(capabilityExample)}, Protocol.Capability> = true;`,
].join("\n");

const typeErrors = (): string => {
  mkdirSync(folder, { recursive: true });
  writeFileSync(new URL("tsconfig.json", folder), JSON.stringify(TSCONFIG));
  writeFileSync(new URL("check.ts", folder), source);
  const compiler = fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url));
  return spawnSync(process.execPath, [compiler, "--project", fileURLToPath(folder)], { encoding: "utf8" }).stdout;
};

test("the exported types are the types the spec declares", () => {
  expect(source).toContain("Equal<Document, Protocol.Document>");
  expect(typeErrors()).toBe("");
});
