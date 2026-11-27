import { type JsonObject, type Schema, validate } from "@agentpages/protocol";
import type { Value } from "../ports/storage.js";

/** The storage returned something the Store never put there. */
class CorruptRecord extends Error {
  override readonly name = "CorruptRecord";
}

export const recordOf = (value: Value): JsonObject => {
  if (value instanceof Uint8Array) throw new CorruptRecord();
  return value;
};

/** `value` as the `T` it was stored as, without any field the schema does not know. */
export const parsed = <T>(schema: Schema<T>, value: unknown): T => {
  const checked = validate(schema, value);
  if (!checked.ok) throw new CorruptRecord();
  return checked.value;
};
