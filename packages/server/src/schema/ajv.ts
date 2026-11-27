import type { Issue, JsonSchema, Problem } from "@agentpages/protocol";
import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import type { CompiledSchema, SchemaCompiler } from "../ports/compiler.js";

/** An issue says what was expected and where, as a JSON Pointer split at its slashes. */
const issueOf = ({ message, instancePath }: ErrorObject): Issue => ({
  message: String(message),
  path: instancePath.split("/").slice(1),
});

/**
 * Ajv is strict by default: it rejects what JSON Schema 2020-12 does not define. Its opinions about schemas that are
 * valid all the same are turned off, formats are not checked, and every problem of the data is reported.
 */
const OPTIONS = { strictTypes: false, strictTuples: false, validateFormats: false, allErrors: true } as const;

/** A fresh Ajv for every schema, so that no schema can refer to another one. Nothing is ever loaded from a `$ref`. */
const compiled = (schema: JsonSchema): CompiledSchema => {
  const validateData = new Ajv2020(OPTIONS).compile(schema);
  return {
    check: (data) => {
      validateData(data);
      return (validateData.errors ?? []).map(issueOf);
    },
  };
};

/** A SchemaCompiler built on Ajv. */
export const ajvSchemaCompiler: SchemaCompiler = {
  compile: (schema): CompiledSchema | Problem => {
    try {
      return compiled(schema);
    } catch (error) {
      return { error: "InvalidParams", message: `It is not valid JSON Schema 2020-12 that stands alone. ${String(error)}` };
    }
  },
};
