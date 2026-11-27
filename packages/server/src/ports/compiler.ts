import type { Issue, JsonSchema, Problem } from "@agentpages/protocol";

export interface CompiledSchema {
  /** What is wrong with `data`. Nothing when it matches the schema. */
  check(data: unknown): Issue[];
}

export interface SchemaCompiler {
  /** A `Problem` when `schema` is not valid JSON Schema 2020-12, or refers to anything outside itself. */
  compile(schema: JsonSchema): CompiledSchema | Problem;
}
