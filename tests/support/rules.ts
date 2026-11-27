import * as fc from "fast-check";

export interface Rule {
  base: "string" | "number";
  accepts: (value: unknown) => boolean;
  valid: fc.Arbitrary<unknown>;
  near: fc.Arbitrary<unknown>;
}

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const ALPHANUMERIC = `${DIGITS}${LOWER}${LOWER.toUpperCase()}`;
const ID_CHARACTERS = `${ALPHANUMERIC}_-`;
const HEX = `${DIGITS}abcdef`;
const BASE64_CHARACTERS = `${ALPHANUMERIC}+/`;
const STRAY_CHARACTERS = Array.from("09afAFgzGZ_-+/=.:TZ \né\u{1F600}");
const RESERVED_KEYS = ["constructor", "prototype", "__proto__", "toString", "pdf"];
const MAX_COUNT = 2 ** 53 - 1;

const charactersOf = (alphabet: string): fc.Arbitrary<string> => fc.constantFrom(...Array.from(alphabet));

const isString = (value: unknown): value is string => typeof value === "string";

const madeOf = (alphabet: string) => (text: string): boolean => Array.from(text).every((character) => alphabet.includes(character));

const textOf = (alphabet: string, length: fc.StringConstraints): fc.Arbitrary<string> =>
  fc.string({ ...length, unit: charactersOf(alphabet) });

interface Edit {
  at: number;
  remove: number;
  insert: string;
}

const applyEdit = (text: string, { at, remove, insert }: Edit): string => {
  const position = at % (text.length + 1);
  return `${text.slice(0, position)}${insert}${text.slice(position + remove)}`;
};

const edits: fc.Arbitrary<Edit> = fc.record({
  at: fc.nat(),
  remove: fc.constantFrom(0, 1),
  insert: fc.oneof(fc.constant(""), fc.constantFrom(...STRAY_CHARACTERS), fc.string({ maxLength: 2 })),
});

interface StringRule {
  accepts: (text: string) => boolean;
  valid: fc.Arbitrary<string>;
  extremes?: string[];
  also?: fc.Arbitrary<string>;
}

/** Valid values, values one edit away from valid, and arbitrary values. */
const stringRule = ({ accepts, valid, extremes = [], also = valid }: StringRule): Rule => ({
  base: "string",
  accepts: (value) => isString(value) && accepts(value),
  valid,
  near: fc.oneof(
    valid,
    also,
    fc.tuple(valid, edits).map(([text, edit]) => applyEdit(text, edit)),
    fc.constantFrom("", ...extremes),
    fc.jsonValue(),
  ),
});

const isId = (text: string): boolean => text.length > 0 && text.length <= 128 && madeOf(ID_CHARACTERS)(text);

const ids: fc.Arbitrary<string> = fc.oneof(
  textOf(ID_CHARACTERS, { minLength: 1, maxLength: 12 }),
  textOf(ID_CHARACTERS, { minLength: 126, maxLength: 128 }),
  fc.constantFrom(...RESERVED_KEYS.filter((key) => key !== "pdf")),
);

const isExportFormat = (text: string): boolean => isId(text) && text !== "pdf";

const idExtremes = ["a".repeat(128), "a".repeat(129), ...RESERVED_KEYS];

const UUID_DASHES = new Set([8, 13, 18, 23]);

const isUuid = (text: string): boolean =>
  text.length === 36 &&
  Array.from(text).every((character, index) => (UUID_DASHES.has(index) ? character === "-" : HEX.includes(character)));

const hex = (length: number): fc.Arbitrary<string> => textOf(HEX, { minLength: length, maxLength: length });

const uuids: fc.Arbitrary<string> = fc
  .tuple(hex(8), hex(4), hex(4), hex(4), hex(12))
  .map((groups) => groups.join("-"));

interface Clock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

const padded = (value: number, width: number): string => String(value).padStart(width, "0");

const written = ({ year, month, day, hour, minute, second, millisecond }: Clock): string =>
  `${padded(year, 4)}-${padded(month, 2)}-${padded(day, 2)}T${padded(hour, 2)}:${padded(minute, 2)}:${padded(second, 2)}.${padded(millisecond, 3)}Z`;

const TIMESTAMP_PUNCTUATION = new Map([
  [4, "-"],
  [7, "-"],
  [10, "T"],
  [13, ":"],
  [16, ":"],
  [19, "."],
  [23, "Z"],
]);

const hasTimestampLayout = (text: string): boolean =>
  text.length === 24 &&
  Array.from(text).every((character, index) => (TIMESTAMP_PUNCTUATION.get(index) ?? DIGITS).includes(character));

const between = (text: string, [start, low, high]: [number, number, number]): boolean => {
  const value = Number(text.slice(start, start + 2));
  return value >= low && value <= high;
};

const TIMESTAMP_RANGES: [number, number, number][] = [
  [5, 1, 12],
  [8, 1, 31],
  [11, 0, 23],
  [14, 0, 59],
  [17, 0, 59],
];

const isTimestamp = (text: string): boolean =>
  hasTimestampLayout(text) && TIMESTAMP_RANGES.every((range) => between(text, range));

const clocks = (slack: number): fc.Arbitrary<string> =>
  fc
    .record({
      year: fc.integer({ min: 0, max: 9999 }),
      month: fc.integer({ min: 1 - slack, max: 12 + slack * 8 }),
      day: fc.integer({ min: 1 - slack, max: 31 + slack * 9 }),
      hour: fc.integer({ min: 0, max: 23 + slack * 7 }),
      minute: fc.integer({ min: 0, max: 59 + slack * 10 }),
      second: fc.integer({ min: 0, max: 59 + slack * 10 }),
      millisecond: fc.integer({ min: 0, max: 999 }),
    })
    .map(written);

const length = (text: string): number => Array.from(text).length;

const sized = (min: number, max: number): Rule => {
  const lengths = [0, 1, 2, max - 1, max, max + 1];
  const extremes = fc
    .tuple(fc.constantFrom(...lengths), fc.constantFrom("a", " ", "\n", "\u{1F600}"))
    .map(([count, character]) => character.repeat(count));
  const valid = fc.string({ minLength: min, maxLength: 20, unit: "binary" });
  return {
    base: "string",
    accepts: (value) => isString(value) && length(value) >= min && length(value) <= max,
    valid,
    near: fc.oneof(valid, extremes, fc.jsonValue()),
  };
};

const isBase64 = (text: string): boolean => {
  const body = text.replace(/={1,2}$/u, "");
  return text.length % 4 === 0 && madeOf(BASE64_CHARACTERS)(body);
};

const base64s: fc.Arbitrary<string> = fc
  .uint8Array({ maxLength: 12 })
  .map((bytes) => Buffer.from(bytes).toString("base64"));

const isTreeIndex = (text: string): boolean =>
  text.length > 0 && madeOf(ALPHANUMERIC)(text) && !text.endsWith("0");

const treeIndexes: fc.Arbitrary<string> = fc
  .tuple(textOf(ALPHANUMERIC, { maxLength: 6 }), charactersOf(ALPHANUMERIC.slice(1)))
  .map((parts) => parts.join(""));

const numbers: fc.Arbitrary<unknown> = fc.oneof(
  fc.integer(),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.constantFrom(-1, 0, 1, 99, 100, 101, 0.5, MAX_COUNT, MAX_COUNT + 1),
  fc.jsonValue(),
);

const integerRule = (min: number, max: number): Rule => ({
  base: "number",
  accepts: (value) => Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max,
  valid: fc.oneof(fc.integer({ min, max: Math.min(max, min + 5) }), fc.integer({ min, max }), fc.constantFrom(min, max)),
  near: numbers,
});

const isVersion = (text: string): boolean => {
  const parts = text.split(".");
  return parts.length === 2 && parts.every((part) => part.length > 0 && madeOf(DIGITS)(part));
};

const versions: fc.Arbitrary<string> = fc
  .tuple(textOf(DIGITS, { minLength: 1, maxLength: 3 }), textOf(DIGITS, { minLength: 1, maxLength: 3 }))
  .map((parts) => parts.join("."));

const BASE64_EXTREMES = ["=", "==", "A===", "AA==", "AAA=", "AAAA", "A", "AA", "AAA", "AA=A", "===="];

export const RULES = {
  id: stringRule({ accepts: isId, valid: ids, extremes: idExtremes }),
  exportFormat: stringRule({ accepts: isExportFormat, valid: ids.filter(isExportFormat), extremes: idExtremes }),
  uuid: stringRule({ accepts: isUuid, valid: uuids }),
  timestamp: stringRule({ accepts: isTimestamp, valid: clocks(0), also: clocks(1) }),
  base64: stringRule({ accepts: isBase64, valid: base64s, extremes: BASE64_EXTREMES }),
  treeIndex: stringRule({ accepts: isTreeIndex, valid: treeIndexes, extremes: ["0", "a0", "00"] }),
  version: stringRule({ accepts: isVersion, valid: versions, extremes: ["0.1", "1", "1.", ".1", "1.2.3"] }),
  name: sized(1, 255),
  description: sized(0, 1024),
  body: sized(0, 65_536),
  count: integerRule(0, MAX_COUNT),
  limit: integerRule(1, 100),
} satisfies Record<string, Rule>;

export type RuleName = keyof typeof RULES;
