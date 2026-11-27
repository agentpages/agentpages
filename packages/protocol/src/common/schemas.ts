import * as v from "valibot";
import { MAX_COUNT, MAX_LIMIT } from "./constants.js";
import {
  BASE64_PATTERN,
  BODY_PATTERN,
  DESCRIPTION_PATTERN,
  ID_PATTERN,
  NAME_PATTERN,
  TIMESTAMP_PATTERN,
  UUID_PATTERN,
} from "./patterns.js";
import type { Empty, Exchange, JsonObject, Paging } from "./types.js";

export type Schema<T> = v.GenericSchema<unknown, T>;

export type ExchangeSchemas<M> = {
  readonly [K in keyof M]: M[K] extends Exchange
    ? { readonly params: Schema<M[K]["params"]>; readonly result: Schema<M[K]["result"]> }
    : never;
};

type Text = v.GenericSchema<string, string>;

export type Optional<T> = v.ExactOptionalSchema<Schema<T>, undefined>;

export const matching = (pattern: RegExp): Text => v.pipe(v.string(), v.regex(pattern));

const integerBetween = (min: number, max: number): Schema<number> =>
  v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max));

const isJsonObject = (input: unknown): input is JsonObject =>
  typeof input === "object" && input !== null && !Array.isArray(input);

export const JsonObjectSchema: Schema<JsonObject> = v.custom<JsonObject>(isJsonObject);

/** An object used as a map. Unlike `v.record`, it checks every key, `constructor` and `__proto__` included. */
export const record = <T>(key: Text, value: Schema<T>): Schema<Record<string, T>> =>
  v.custom<Record<string, T>>(
    (input) =>
      isJsonObject(input) && Object.entries(input).every(([name, item]) => v.is(key, name) && v.is(value, item)),
  );

export const IdSchema: Text = matching(ID_PATTERN);

export const UuidSchema: Schema<string> = matching(UUID_PATTERN);

export const TimestampSchema: Schema<string> = matching(TIMESTAMP_PATTERN);

export const Base64Schema: Schema<string> = matching(BASE64_PATTERN);

export const NameSchema: Schema<string> = matching(NAME_PATTERN);

export const DescriptionSchema: Schema<string> = matching(DESCRIPTION_PATTERN);

export const BodySchema: Schema<string> = matching(BODY_PATTERN);

export const CountSchema: Schema<number> = integerBetween(0, MAX_COUNT);

export const LimitSchema: Schema<number> = integerBetween(1, MAX_LIMIT);

export const EmptySchema: Schema<Empty> = v.pipe(JsonObjectSchema, v.object({}));

export const PagingSchema: Schema<Paging> = v.pipe(
  JsonObjectSchema,
  v.object({ cursor: v.exactOptional(v.string()), limit: v.exactOptional(LimitSchema) }),
);
