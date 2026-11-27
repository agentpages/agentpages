import type { JsonSchema } from "@agentpages/protocol";
import { corrupt } from "../pipeline/records.js";
import type { CompiledSchema, SchemaCompiler } from "../ports/compiler.js";

const MAX_COMPILED_SCHEMAS = 1024;

/** A collection of one version of a type. A version of a type never changes, and neither does the schema it declares. */
interface Declared {
  typeId: string;
  version: number;
  collection: string;
}

/** The compiled schemas a Store keeps in memory: the 1024 it used last. */
export interface Checks {
  /** `schema`, which `declared` declares, compiled. It is compiled when the Store does not keep it. */
  of(declared: Declared, schema: JsonSchema): CompiledSchema;
}

/** A schema that was valid when its type was published compiles. */
const compiledBy = (compiler: SchemaCompiler, schema: JsonSchema): CompiledSchema => {
  const compiled = compiler.compile(schema);
  return "error" in compiled ? corrupt() : compiled;
};

export const checksWith = (compiler: SchemaCompiler): Checks => {
  const kept = new Map<string, CompiledSchema>();
  return {
    of: ({ typeId, version, collection }, schema) => {
      const key = `${typeId}/${version}/${collection}`;
      const compiled = kept.get(key) ?? compiledBy(compiler, schema);
      kept.delete(key);
      kept.set(key, compiled);
      const [leastRecentlyUsed = key] = kept.keys();
      if (kept.size > MAX_COMPILED_SCHEMAS) kept.delete(leastRecentlyUsed);
      return compiled;
    },
  };
};
