import { type JsonObject, type Schema, validate } from "@agentpages/protocol";
import type { Value } from "@agentpages/storage";

/** The storage returned something the Store never put there. */
class CorruptRecord extends Error {
  override readonly name = "CorruptRecord";
}

export const recordOf = (value: Value): JsonObject => {
  if (value instanceof Uint8Array) throw new CorruptRecord();
  return value;
};

/** What a stored schema or record turns out to be when it is not what the Store saved. */
export const corrupt = (): never => {
  throw new CorruptRecord();
};

/** The count a record keeps under `field`. A record that was never saved counts 0. */
export const countIn = (value: Value | undefined, field: string): number => {
  if (value === undefined) return 0;
  const count = recordOf(value)[field];
  return typeof count === "number" ? count : corrupt();
};

/** `value` as the `T` it was stored as, without any field the schema does not know. */
export const parsed = <T>(schema: Schema<T>, value: unknown): T => {
  const checked = validate(schema, value);
  if (!checked.ok) throw new CorruptRecord();
  return checked.value;
};

/** A page or type as it is stored: what the spec says of it, and the subject that owns it. */
export interface Owned<T> {
  owner: string;
  info: T;
}

/** `value` as the `T` its owner stored. A record without an owner is corrupt. */
export const owned = <T>(schema: Schema<T>, value: Value): Owned<T> => {
  const { owner } = recordOf(value);
  if (typeof owner !== "string") throw new CorruptRecord();
  return { owner, info: parsed(schema, value) };
};
