import * as fc from "fast-check";
import { numberIn, textIn } from "./spec.ts";

export interface Rule {
  base: "string" | "number";
  accepts: (value: unknown) => boolean;
  valid: fc.Arbitrary<unknown>;
  near: fc.Arbitrary<unknown>;
}

/** What section 2.1 and the sections it points to state in numbers and words. */
const STATED = {
  idLength: numberIn(/match `\^\[A-Za-z0-9_-\]\{1,(\d+)\}\$`/u),
  uuidGroups: textIn(/in lowercase as `([\d-]+)` hexadecimal digits/u).split("-").map(Number),
  timestamp: textIn(/real UTC dates and times, written as `([^`]+)`/u),
  countBits: numberIn(/is an integer from 0 to 2\^(\d+) − 1/u),
  limitFrom: numberIn(/Every `limit` is (\d+) to \d+/u),
  limitTo: numberIn(/Every `limit` is \d+ to (\d+)/u),
  nameFrom: numberIn(/`mimeType` are (\d+) to \d+ characters/u),
  nameTo: numberIn(/`mimeType` are \d+ to (\d+) characters/u),
  descriptionTo: numberIn(/`quote` are at most (\d+)\./u),
  bodyTo: numberIn(/`instructions` are at most (\d+)\./u),
  reservedFormat: textIn(/A key of `exports` is an id, as in section 2\.1, other than `(\w+)`/u),
};

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const ALPHANUMERIC = `${DIGITS}${LOWER}${LOWER.toUpperCase()}`;
const ID_CHARACTERS = `${ALPHANUMERIC}_-`;
const HEX = `${DIGITS}abcdef`;
const BASE64_CHARACTERS = `${ALPHANUMERIC}+/`;
const STRAY_CHARACTERS = Array.from("09afAFgzGZ_-+/=.:TZ \né\u{1F600}");
const RESERVED_KEYS = ["constructor", "prototype", "__proto__", "toString", STATED.reservedFormat];
const MAX_COUNT = 2 ** STATED.countBits - 1;

const charactersOf = (alphabet: string): fc.Arbitrary<string> => fc.constantFrom(...Array.from(alphabet));

const isString = (value: unknown): value is string => typeof value === "string";

const madeOf = (alphabet: string) => (text: string): boolean =>
  Array.from(text).every((character) => alphabet.includes(character));

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

const isId = (text: string): boolean =>
  text.length > 0 && text.length <= STATED.idLength && madeOf(ID_CHARACTERS)(text);

const isExportFormat = (text: string): boolean => isId(text) && text !== STATED.reservedFormat;

const ids: fc.Arbitrary<string> = fc.oneof(
  textOf(ID_CHARACTERS, { minLength: 1, maxLength: 12 }),
  textOf(ID_CHARACTERS, { minLength: STATED.idLength - 2, maxLength: STATED.idLength }),
  fc.constantFrom(...RESERVED_KEYS.filter(isExportFormat)),
);

const idExtremes = ["a".repeat(STATED.idLength), "a".repeat(STATED.idLength + 1), ...RESERVED_KEYS];

/** Where each group of a UUID ends, its dash included. */
const uuidDashes = new Set(
  STATED.uuidGroups.slice(0, -1).map((_, group) => STATED.uuidGroups.slice(0, group + 1).reduce((end, size) => end + size + 1, -1)),
);

const uuidLength = STATED.uuidGroups.reduce((length, size) => length + size + 1, -1);

const isUuid = (text: string): boolean =>
  text.length === uuidLength &&
  Array.from(text).every((character, index) => (uuidDashes.has(index) ? character === "-" : HEX.includes(character)));

const hex = (length: number): fc.Arbitrary<string> => textOf(HEX, { minLength: length, maxLength: length });

const uuids: fc.Arbitrary<string> = fc.tuple(...STATED.uuidGroups.map(hex)).map((groups) => groups.join("-"));

const isDigitPlace = (letter: string): boolean => /[A-Za-z]/u.test(letter) && letter !== "T" && letter !== "Z";

const fitsTemplate = (text: string): boolean =>
  text.length === STATED.timestamp.length &&
  Array.from(STATED.timestamp).every((letter, index) =>
    isDigitPlace(letter) ? DIGITS.includes(text.charAt(index)) : text.charAt(index) === letter,
  );

/** The number written where the template has `letters`, such as the month at `MM`. */
const fieldOf = (text: string, letters: string): number => {
  const start = STATED.timestamp.indexOf(letters);
  return Number(text.slice(start, start + letters.length));
};

const isLeapYear = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const daysIn = (year: number, month: number): number =>
  [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;

const within = (value: number, [low, high]: [number, number]): boolean => value >= low && value <= high;

/** A reading in the written form of a timestamp, on a day no month is too short for. */
const isClockReading = (text: string): boolean => isReading(text, 31);

const isTimestamp = (text: string): boolean => isReading(text, daysIn(fieldOf(text, "YYYY"), fieldOf(text, "MM")));

const isReading = (text: string, days: number): boolean =>
  fitsTemplate(text) &&
  within(fieldOf(text, "MM"), [1, 12]) &&
  within(fieldOf(text, "DD"), [1, days]) &&
  within(fieldOf(text, "HH"), [0, 23]) &&
  within(fieldOf(text, "mm"), [0, 59]) &&
  within(fieldOf(text, "ss"), [0, 59]);

const padded = (value: number, width: number): string => String(value).padStart(width, "0");

interface Clock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

const written = ({ year, month, day, hour, minute, second, millisecond }: Clock): string =>
  `${padded(year, 4)}-${padded(month, 2)}-${padded(day, 2)}T${padded(hour, 2)}:${padded(minute, 2)}:${padded(second, 2)}.${padded(millisecond, 3)}Z`;

/** Clock readings that look like timestamps, many of them on days or at hours that do not exist. */
const looseClocks: fc.Arbitrary<string> = fc
  .record({
    year: fc.constantFrom(0, 1900, 2000, 2023, 2024, 2100, 9999),
    month: fc.integer({ min: 0, max: 13 }),
    day: fc.integer({ min: 0, max: 32 }),
    hour: fc.integer({ min: 0, max: 25 }),
    minute: fc.integer({ min: 0, max: 61 }),
    second: fc.integer({ min: 0, max: 61 }),
    millisecond: fc.integer({ min: 0, max: 999 }),
  })
  .map(written);

const timestamps: fc.Arbitrary<string> = fc
  .date({ min: new Date("0000-01-01T00:00:00.000Z"), max: new Date("9999-12-31T23:59:59.999Z"), noInvalidDate: true })
  .map((date) => date.toISOString());

const length = (text: string): number => Array.from(text).length;

const sized = (min: number, max: number): Rule => {
  const extremes = fc
    .tuple(fc.constantFrom(0, 1, 2, max - 1, max, max + 1), fc.constantFrom("a", " ", "\n", "\u{1F600}"))
    .map(([count, character]) => character.repeat(count));
  const valid = fc.string({ minLength: min, maxLength: 20, unit: "binary" });
  return {
    base: "string",
    accepts: (value) => isString(value) && length(value) >= min && length(value) <= max,
    valid,
    near: fc.oneof(valid, extremes, fc.jsonValue()),
  };
};

/** RFC 4648, section 4, in canonical form: exactly what an encoder writes. */
const isBase64 = (text: string): boolean => Buffer.from(text, "base64").toString("base64") === text;

const base64s: fc.Arbitrary<string> = fc
  .uint8Array({ maxLength: 12 })
  .map((bytes) => Buffer.from(bytes).toString("base64"));

/** Base64 whose last group may leave unused bits set. */
const looseBase64s: fc.Arbitrary<string> = fc
  .tuple(base64s, charactersOf(BASE64_CHARACTERS), fc.constantFrom(1, 2, 3))
  .map(([text, character, back]) => applyEdit(text, { at: Math.max(0, text.length - back), remove: 1, insert: character }));

const BASE64_EXTREMES = ["=", "==", "A===", "AA==", "AB==", "AAA=", "AAB=", "AAAA", "A", "AA", "AAA", "AA=A", "===="];

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

/** Section 2.1: a cursor is printable ASCII. */
const isCursor = (text: string): boolean => Array.from(text).every((character) => character >= " " && character <= "~");

const DATES = ["2024-02-29T00:00:00.000Z", "2023-02-29T00:00:00.000Z", "2100-02-29T00:00:00.000Z", "2000-02-29T00:00:00.000Z"];

export const RULES = {
  id: stringRule({ accepts: isId, valid: ids, extremes: idExtremes }),
  exportFormat: stringRule({ accepts: isExportFormat, valid: ids.filter(isExportFormat), extremes: idExtremes }),
  uuid: stringRule({ accepts: isUuid, valid: uuids }),
  timestamp: stringRule({ accepts: isTimestamp, valid: timestamps, also: looseClocks, extremes: DATES }),
  clockReading: stringRule({ accepts: isClockReading, valid: timestamps, also: looseClocks, extremes: DATES }),
  base64: stringRule({ accepts: isBase64, valid: base64s, also: looseBase64s, extremes: BASE64_EXTREMES }),
  treeIndex: stringRule({ accepts: isTreeIndex, valid: treeIndexes, extremes: ["0", "a0", "00"] }),
  version: stringRule({ accepts: isVersion, valid: versions, extremes: ["0.1", "1", "1.", ".1", "1.2.3"] }),
  name: sized(STATED.nameFrom, STATED.nameTo),
  description: sized(0, STATED.descriptionTo),
  body: sized(0, STATED.bodyTo),
  cursor: stringRule({ accepts: isCursor, valid: fc.string(), extremes: [" ~", "\u001F", "\u007F", "\u00E9"] }),
  count: integerRule(0, MAX_COUNT),
  limit: integerRule(STATED.limitFrom, STATED.limitTo),
} satisfies Record<string, Rule>;

export type RuleName = keyof typeof RULES;

/** The export format every page has, which a type may not declare. */
export const RESERVED_FORMAT: string = STATED.reservedFormat;
