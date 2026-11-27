import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import { noComments } from "./lint/no-comments.ts";

const suppressions = { "ts-expect-error": true, "ts-ignore": true, "ts-nocheck": true };

export default defineConfig(
  { ignores: ["**/dist/**", "**/node_modules/**", "reports/**"] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    linterOptions: { noInlineConfig: true },
    plugins: { agentpages: { rules: { "no-comments": noComments } } },
    rules: {
      "agentpages/no-comments": "error",
      "@typescript-eslint/ban-ts-comment": ["error", suppressions],
      "@typescript-eslint/no-unsafe-type-assertion": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "no-restricted-syntax": ["error", { selector: "ImportExpression", message: "Use a static import." }],
      "max-params": ["error", 2],
      "max-lines-per-function": ["error", { max: 40, skipBlankLines: true }],
      "max-depth": ["error", 2],
      complexity: ["error", 8],
    },
  },
);
