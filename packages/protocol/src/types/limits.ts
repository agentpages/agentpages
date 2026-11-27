import { utf8Length } from "../common/bytes.js";
import type { Problem } from "../errors/types.js";
import type { Limits } from "../extension/types.js";
import type { JsonSchema } from "./types.js";

const schemaBytes = (schema: JsonSchema): number => utf8Length(JSON.stringify(schema));

/** The limit a well-formed `schema` breaks, if any. Its size is that of its UTF-8 JSON without whitespace. */
export const schemaProblem = ({ schema, limits }: { schema: JsonSchema; limits: Limits }): Problem | undefined =>
  schemaBytes(schema) > limits.maxSchemaBytes
    ? {
        error: "LimitExceeded",
        message: `schema of ${schemaBytes(schema)} bytes is larger than maxSchemaBytes ${limits.maxSchemaBytes}`,
      }
    : undefined;
