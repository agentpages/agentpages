import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packagesDir = new URL("./packages/", import.meta.url);

const sourceEntry = (name: string): [string, string] => [
  `@agentpages/${name}`,
  fileURLToPath(new URL(`${name}/src/index.ts`, packagesDir)),
];

export default defineConfig({
  resolve: { alias: Object.fromEntries(readdirSync(packagesDir).map(sourceEntry)) },
  test: { exclude: ["**/node_modules/**", "**/dist/**", "reports/**"] },
});
