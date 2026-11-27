import { defineConfig, type OxlintOverride } from "oxlint";

const packages = ["protocol", "storage", "client", "host", "react", "server", "mcp", "conformance"];
const uiFrameworks = ["react", "react-dom", "vue", "svelte"];

const relativeIntoAnotherPackage = {
  regex: `^(\\.\\./)+(${packages.join("|")})/`,
  message: "Import another package by its name.",
};

const onlyThesePackages = (allowed: string[]) => ({
  group: ["@agentpages/*", ...allowed.map((name) => `!@agentpages/${name}`)],
  message: "This package may not depend on that one. See the package table in README.md.",
});

const noUiFramework = {
  group: uiFrameworks.flatMap((name) => [name, `${name}/*`]),
  message: "This package is framework-free.",
};

const restrictImports = (patterns: object[]): NonNullable<OxlintOverride["rules"]> => ({
  "eslint/no-restricted-imports": ["error", { patterns }],
});

const boundary = (name: string, patterns: object[]): OxlintOverride => ({
  files: [`packages/${name}/**`],
  rules: restrictImports([relativeIntoAnotherPackage, ...patterns]),
});

const testsUsePublicApi: OxlintOverride = {
  files: ["**/*.test.ts"],
  rules: restrictImports([
    { group: ["./*", "../*", "!./index.js"], message: "Tests import only a package's entry point." },
  ]),
};

export default defineConfig({
  plugins: ["eslint", "typescript", "unicorn", "oxc", "import", "promise", "node", "vitest"],
  options: { typeAware: true, reportUnusedDisableDirectives: "error" },
  categories: { correctness: "error", suspicious: "error", pedantic: "error", perf: "error" },
  ignorePatterns: ["dist", "reports"],
  rules: {
    "typescript/no-explicit-any": "error",
    "typescript/no-non-null-assertion": "error",
    "typescript/no-unnecessary-condition": "error",
    "typescript/ban-ts-comment": ["error", { "ts-expect-error": true, "ts-ignore": true, "ts-nocheck": true }],
    "unicorn/no-array-callback-reference": "off",
    "typescript/prefer-readonly-parameter-types": "off",
    "import/no-cycle": "error",
    "eslint/max-params": ["error", { max: 2 }],
    "eslint/max-lines-per-function": ["error", { max: 40, skipBlankLines: true }],
    "eslint/max-depth": ["error", { max: 2 }],
    "eslint/complexity": ["error", { max: 8 }],
  },
  overrides: [
    boundary("protocol", [onlyThesePackages([])]),
    boundary("storage", [onlyThesePackages([])]),
    boundary("client", [onlyThesePackages(["protocol"])]),
    boundary("host", [onlyThesePackages(["protocol"]), noUiFramework]),
    boundary("server", [onlyThesePackages(["protocol", "storage"]), noUiFramework]),
    boundary("react", [onlyThesePackages(["protocol", "host"])]),
    boundary("mcp", [onlyThesePackages(["protocol", "server"])]),
    boundary("conformance", [onlyThesePackages(["protocol", "storage"]), noUiFramework]),
    testsUsePublicApi,
  ],
});
