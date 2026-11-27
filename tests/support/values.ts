import * as fc from "fast-check";
import { isObject, type JsonObject } from "./json.ts";
import { RULES, type RuleName } from "./rules.ts";

/** What the spec allows in one place, written without the package under test. */
export interface Shape {
  kind: string;
  accepts: (value: unknown) => boolean;
  valid: fc.Arbitrary<unknown>;
  fields: Field[];
  item?: Shape;
  options?: Shape[];
  /** Whether the object also carries fields the spec does not name, as a tree node does. */
  open?: boolean;
}

export interface Field {
  name: string;
  optional: boolean;
  shape: Shape;
}

interface Simple {
  accepts: (value: unknown) => boolean;
  valid: fc.Arbitrary<unknown>;
}

export const ANYTHING: Shape = { kind: "unknown", fields: [], accepts: () => true, valid: fc.jsonValue() };

const SIMPLE: Record<string, Simple> = {
  string: { accepts: (value) => typeof value === "string", valid: fc.string() },
  number: {
    accepts: (value) => typeof value === "number",
    valid: fc.oneof(fc.integer(), fc.double({ noNaN: true, noDefaultInfinity: true })),
  },
  boolean: { accepts: (value) => typeof value === "boolean", valid: fc.boolean() },
  null: { accepts: (value) => value === null, valid: fc.constant(null) },
  unknown: ANYTHING,
};

export const simple = (kind: string): Shape | undefined => {
  const found = SIMPLE[kind];
  return found === undefined ? undefined : { kind, fields: [], ...found };
};

export const literal = (value: unknown): Shape => ({
  kind: "literal",
  accepts: (candidate) => candidate === value,
  valid: fc.constant(value),
  fields: [],
});

export const format = (rule: RuleName): Shape => ({ kind: RULES[rule].base, fields: [], ...RULES[rule] });

export interface Bounds {
  min: number;
  max: number;
}

const ANY_LENGTH: Bounds = { min: 0, max: Infinity };

export const array = (item: Shape, { min, max }: Bounds = ANY_LENGTH): Shape => ({
  kind: "array",
  accepts: (value) =>
    Array.isArray(value) && value.length >= min && value.length <= max && value.every(item.accepts),
  valid: fc.array(item.valid, { minLength: min, maxLength: Math.max(min, 3) }),
  fields: [],
  item,
});

const anyKey: Simple = {
  accepts: () => true,
  valid: fc.oneof(fc.string(), fc.constantFrom("constructor", "prototype", "__proto__")),
};

const validKey = (key: Simple): fc.Arbitrary<string> => key.valid.map(String);

/** An object used as a map, whose keys follow a rule or are any string. */
export const record = (item: Shape, key: Simple = anyKey): Shape => ({
  kind: "record",
  accepts: (value) =>
    isObject(value) && Object.entries(value).every(([name, entry]) => key.accepts(name) && item.accepts(entry)),
  valid: fc.dictionary(validKey(key), item.valid, { maxKeys: 3, noNullPrototype: true }),
  fields: [],
  item,
});

const hasField = (value: JsonObject, { name, optional, shape }: Field): boolean =>
  Object.hasOwn(value, name) ? shape.accepts(value[name]) : optional;

const known = (fields: Field[]): fc.Arbitrary<JsonObject> =>
  fc.record(Object.fromEntries(fields.map((field) => [field.name, field.shape.valid])), {
    requiredKeys: fields.filter((field) => !field.optional).map((field) => field.name),
    noNullPrototype: true,
  });

const extras: fc.Arbitrary<JsonObject> = fc.dictionary(validKey(anyKey), fc.jsonValue(), {
  maxKeys: 2,
  noNullPrototype: true,
});

const merged = ([extra, named]: [JsonObject, JsonObject]): JsonObject => ({ ...extra, ...named });

const withExtras = (fields: Field[]): fc.Arbitrary<JsonObject> => fc.tuple(extras, known(fields)).map(merged);

export const object = (fields: Field[], open = false): Shape => ({
  kind: "object",
  accepts: (value) => isObject(value) && fields.every((field) => hasField(value, field)),
  valid: open ? withExtras(fields) : known(fields),
  fields,
  open,
});

export const union = (options: Shape[]): Shape => ({
  kind: "union",
  accepts: (value) => options.some((option) => option.accepts(value)),
  valid: fc.oneof(...options.map((option) => option.valid)),
  fields: [],
  options,
});

export type Path = (string | number)[];

const pathsIn = (value: unknown): Path[] => {
  const entries: [string | number, unknown][] = Array.isArray(value)
    ? [...value.entries()]
    : Object.entries(isObject(value) ? value : {});
  const root: Path = [];
  return [root, ...entries.flatMap(([key, child]) => pathsIn(child).map((path) => root.concat(key, path)))];
};

export interface Change {
  path: Path;
  replacement: unknown;
  remove: boolean;
}

const changedObject = (value: JsonObject, change: Change): JsonObject => {
  const [key = "", ...rest] = change.path;
  const { [key]: child, ...others } = value;
  return change.remove && rest.length === 0
    ? others
    : { ...others, [key]: withChange(child, { ...change, path: rest }) };
};

/** `value` with what is at `path` replaced or, when it is a field, removed. */
export function withChange(value: unknown, change: Change): unknown {
  const [key, ...rest] = change.path;
  if (key === undefined) return change.replacement;
  if (Array.isArray(value)) {
    return value.map((item: unknown, index) => (index === key ? withChange(item, { ...change, path: rest }) : item));
  }
  return isObject(value) ? changedObject(value, change) : value;
}

/** Values of the wrong kind for most places: the ones a careless sender is likeliest to put there. */
const CONFUSIONS: unknown[] = [null, [], {}, "", 0, true];

const REPLACEMENTS: unknown[] = [1, -1, 0.5, 101, 2 ** 53, "a", "a b", "pdf", [1], { a: 1 }];

const isShallow = (path: Path): boolean => path.length <= 1;

const changes = (value: unknown): fc.Arbitrary<Change> =>
  fc.record({
    path: fc.oneof(
      fc.constantFrom(...pathsIn(value).filter(isShallow)),
      fc.constantFrom(...pathsIn(value)),
    ),
    replacement: fc.oneof(
      { weight: 3, arbitrary: fc.constantFrom(...CONFUSIONS) },
      { weight: 1, arbitrary: fc.constantFrom(...REPLACEMENTS) },
      { weight: 1, arbitrary: fc.jsonValue() },
      { weight: 3, arbitrary: fc.oneof(...Object.values(RULES).map((rule) => rule.near)) },
    ),
    remove: fc.boolean(),
  });

/** Values the spec allows where it declares `shape`, and values one change away from them. */
export const near = (shape: Shape): fc.Arbitrary<unknown> =>
  fc.oneof(
    { weight: 1, arbitrary: shape.valid },
    { weight: 3, arbitrary: shape.valid.chain((value) => changes(value).map((change) => withChange(value, change))) },
  );

/** A valid value of `shape` with `replacement` put somewhere inside it. */
export const withReplacement = (shape: Shape, replacement: unknown): fc.Arbitrary<unknown> =>
  shape.valid.chain((value) =>
    fc.constantFrom(...pathsIn(value)).map((path) => withChange(value, { path, replacement, remove: false })),
  );
