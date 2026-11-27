import * as v from "valibot";
import { MAX_COUNT, MAX_LIMIT } from "./constants.js";
import {
  BASE64_PATTERN,
  BODY_PATTERN,
  CURSOR_PATTERN,
  DESCRIPTION_PATTERN,
  ID_PATTERN,
  NAME_PATTERN,
  TIMESTAMP_PATTERN,
  UUID_PATTERN,
} from "./patterns.js";
import type { Empty, JsonObject, Paging } from "./types.js";

/** A schema before it is sealed for export. */
export type Raw<T> = v.GenericSchema<unknown, T>;

export type Optional<T> = v.ExactOptionalSchema<Raw<T>, undefined>;

type Finding = NonNullable<Parameters<v.RawTransformContext<unknown>["addIssue"]>[0]>;

interface Entry {
  name: string;
  item: unknown;
}

export interface MapRules<T> {
  key: Raw<string>;
  value: Raw<T>;
}

export const expectationOf = (issue: v.BaseIssue<unknown>): string => issue.expected ?? issue.type;

const isJsonObject = (input: unknown): input is JsonObject =>
  typeof input === "object" && input !== null && !Array.isArray(input);

/** A JSON object, passed on exactly as it came. */
export const JsonObjectSchema: Raw<JsonObject> = v.pipe(
  v.unknown(),
  v.rawTransform<unknown, JsonObject>(({ dataset, addIssue, NEVER }) => {
    if (isJsonObject(dataset.value)) return dataset.value;
    addIssue({ expected: "a JSON object" });
    return NEVER;
  }),
);

/** The issues of one entry of an object, each placed under the entry's key. */
const underKey = ({ name, item }: Entry, schema: Raw<unknown>): v.BaseIssue<unknown>[] =>
  v.safeParse(v.object({ [name]: schema }), { [name]: item }).issues ?? [];

const keyProblems = (entry: Entry, key: Raw<string>): Finding[] =>
  underKey(entry, v.pipe(v.unknown(), v.transform(() => entry.name), key)).map((issue) => ({
    expected: `key ${expectationOf(issue)}`,
    path: issue.path,
  }));

/** What is wrong with one value of an object. */
export const valueProblems = (entry: Entry, value: Raw<unknown>): Finding[] =>
  underKey(entry, value).map((issue) => ({ expected: expectationOf(issue), path: issue.path }));

/**
 * An object used as a map. Unlike `v.record`, it checks and keeps every key, `constructor` and `__proto__` included.
 */
export const mapOf = <T>({ key, value }: MapRules<T>): Raw<Record<string, T>> =>
  v.pipe(
    JsonObjectSchema,
    v.rawTransform(({ dataset, addIssue, NEVER }) => {
      const entries = Object.entries(dataset.value).map(([name, item]) => ({ name, item }));
      const problems = entries.flatMap((entry) => [...keyProblems(entry, key), ...valueProblems(entry, value)]);
      problems.forEach((problem) => {
        addIssue(problem);
      });
      return problems.length > 0
        ? NEVER
        : Object.fromEntries(entries.map((entry) => [entry.name, v.parse(value, entry.item)]));
    }),
  );

const isRealDay = (timestamp: string): boolean =>
  new Date(timestamp).getUTCDate() === Number(timestamp.slice(8, 10));

export const IdSchema: Raw<string> = v.pipe(v.string(), v.regex(ID_PATTERN));

export const UuidSchema: Raw<string> = v.pipe(v.string(), v.regex(UUID_PATTERN));

export const TimestampSchema: Raw<string> = v.pipe(
  v.string(),
  v.regex(TIMESTAMP_PATTERN),
  v.rawCheck(({ dataset, addIssue }) => {
    if (dataset.typed && !isRealDay(dataset.value)) addIssue({ expected: "a day that exists" });
  }),
);

export const Base64Schema: Raw<string> = v.pipe(v.string(), v.regex(BASE64_PATTERN));

export const NameSchema: Raw<string> = v.pipe(v.string(), v.regex(NAME_PATTERN));

export const DescriptionSchema: Raw<string> = v.pipe(v.string(), v.regex(DESCRIPTION_PATTERN));

export const BodySchema: Raw<string> = v.pipe(v.string(), v.regex(BODY_PATTERN));

export const CountSchema: Raw<number> = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MAX_COUNT));

export const LimitSchema: Raw<number> = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_LIMIT));

export const EmptySchema: Raw<Empty> = v.pipe(JsonObjectSchema, v.object({}));

export const PagingSchema: Raw<Paging> = v.pipe(
  JsonObjectSchema,
  v.object({ cursor: v.exactOptional(v.pipe(v.string(), v.regex(CURSOR_PATTERN))), limit: v.exactOptional(LimitSchema) }),
);

export const PageIdSchema: Raw<{ pageId: string }> = v.object({ pageId: UuidSchema });

/** The params of a view method as a Store tool takes them. */
export const ofPage = <Params>(params: Raw<Params>): Raw<Params & { pageId: string }> =>
  v.intersect([params, PageIdSchema]);
