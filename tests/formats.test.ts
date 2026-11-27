import {
  BODY_PATTERN,
  CapabilitySchema,
  DESCRIPTION_PATTERN,
  fromBase64,
  ID_PATTERN,
  isBase64,
  METHOD_SCHEMAS,
  NAME_PATTERN,
  PDF_FORMAT,
  type Schema,
  TIMESTAMP_PATTERN,
  toBase64,
  TREE_INDEX_PATTERN,
  UUID_PATTERN,
  validate,
  VERSION_PATTERN,
} from "@agentpages/protocol";
import * as fc from "fast-check";
import { expect, test } from "vitest";
import { RESERVED_FORMAT, type Rule, RULES } from "./support/rules.ts";
import { capabilityExample } from "./support/spec.ts";
import { subject, SUBJECTS, verdict } from "./support/subjects.ts";
import { isObject } from "./support/json.ts";
import { type Field, type Path, type Shape, withChange } from "./support/values.ts";

/** A field of a spec type that follows a rule, with valid values of the object around it. */
interface Site {
  schema: Schema<unknown>;
  around: fc.Arbitrary<unknown>;
  path: Path;
}

const isString = (value: unknown): value is string => typeof value === "string";

const follows = (shape: Shape, rule: Rule): boolean => shape.accepts === rule.accepts;

const under = (name: string) => (path: Path): Path => [name, ...path];

const requiredPart = ({ optional, shape }: Field): Shape => (optional ? { ...shape, fields: [] } : shape);

const pathsTo = (shape: Shape, rule: Rule): Path[] =>
  shape.fields.flatMap((field) =>
    follows(field.shape, rule) ? [[field.name]] : pathsTo(requiredPart(field), rule).map(under(field.name)),
  );

const sitesOf = (rule: Rule): Site[] =>
  SUBJECTS.flatMap(({ shape, schema }) =>
    (shape.options ?? [shape]).flatMap((option) =>
      pathsTo(option, rule).map((path) => ({ schema, around: option.valid, path })),
    ),
  );

const placed = (rule: Rule): fc.Arbitrary<[Site, unknown]> =>
  fc.constantFrom(...sitesOf(rule)).chain((site) => fc.tuple(fc.constant(site), site.around));

const placedIn = ([site, around]: [Site, unknown], replacement: unknown): unknown =>
  withChange(around, { path: site.path, replacement, remove: false });

/** A value some field accepts against the rule that governs it, or rejects in spite of it. */
const fieldBreaking = (rule: Rule): unknown =>
  fc.check(
    fc.property(placed(rule), rule.near, (place, value) => verdict(place[0].schema, placedIn(place, value)) === rule.accepts(value)),
  ).counterexample;

/** A value on which an exported reading of a rule and an independent one disagree. */
const readingBreaking = (reads: (text: string) => boolean, rule: Rule): unknown =>
  fc.check(
    fc.property(rule.near, (value) => (typeof value === "string" && reads(value)) === rule.accepts(value)),
    { numRuns: 1000 },
  ).counterexample;

/** A value on which the exported pattern and an independent reading of the rule disagree. */
const patternBreaking = (pattern: RegExp, rule: Rule): unknown => readingBreaking((text) => pattern.test(text), rule);

test("[COMMON-1] ids match ^[A-Za-z0-9_-]{1,128}$", () => {
  expect(patternBreaking(ID_PATTERN, RULES.id)).toBeNull();
  expect(fieldBreaking(RULES.id)).toBeNull();
});

test("[COMMON-2] a pageId and an opId are lowercase 8-4-4-4-12 hexadecimal UUIDs", () => {
  expect(patternBreaking(UUID_PATTERN, RULES.uuid)).toBeNull();
  expect(fieldBreaking(RULES.uuid)).toBeNull();
});

test("[COMMON-3] timestamps are real UTC dates and times written as YYYY-MM-DDTHH:mm:ss.sssZ", () => {
  expect(patternBreaking(TIMESTAMP_PATTERN, RULES.clockReading)).toBeNull();
  expect(fieldBreaking(RULES.timestamp)).toBeNull();
});

test("[COMMON-6] every number is an integer from 0 to 2^53 - 1", () => {
  expect(fieldBreaking(RULES.count)).toBeNull();
});

test("[COMMON-7] title, name and mimeType are 1 to 255 characters", () => {
  expect(patternBreaking(NAME_PATTERN, RULES.name)).toBeNull();
  expect(fieldBreaking(RULES.name)).toBeNull();
});

test("[COMMON-7] description and quote are at most 1024 characters", () => {
  expect(patternBreaking(DESCRIPTION_PATTERN, RULES.description)).toBeNull();
  expect(fieldBreaking(RULES.description)).toBeNull();
});

test("[COMMON-7] body and instructions are at most 65536 characters", () => {
  expect(patternBreaking(BODY_PATTERN, RULES.body)).toBeNull();
  expect(fieldBreaking(RULES.body)).toBeNull();
});

test("[COMMON-8] base64 uses the standard alphabet with padding, in canonical form", () => {
  expect(readingBreaking(isBase64, RULES.base64)).toBeNull();
  expect(fieldBreaking(RULES.base64)).toBeNull();
  expect(["AAAAAAAA", "AAAAA", "AA==AAAA", "AAAA*AAAAAAA", "*AAAAAAA"].map(isBase64)).toStrictEqual([true, false, false, false, false]);
});

test("[COMMON-8] a blob that is not canonical base64 is one issue, which says what was expected", () => {
  const put = { opId: "00000000-0000-4000-8000-000000000001", id: "a", name: "a", mimeType: "a" };
  const issuesOf = (blob: unknown): unknown => validate(METHOD_SCHEMAS["agentpages/files/put"].params, { ...put, blob });

  expect(issuesOf("AB==")).toStrictEqual({ ok: false, issues: [{ message: "Expected canonical base64", path: ["blob"] }] });
  expect(issuesOf(7)).toStrictEqual({ ok: false, issues: [{ message: "Expected string", path: ["blob"] }] });
  expect(isBase64("A".repeat(40_000_000))).toBe(true);
});

test("[COMMON-8] bytes are written as canonical base64, whatever their number", () => {
  const large = Uint8Array.from({ length: 100_001 }, (_, index) => (index * 7) % 256);

  fc.assert(
    fc.property(fc.uint8Array({ maxLength: 12 }), (bytes) => {
      expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
    }),
  );
  expect(toBase64(large)).toBe(Buffer.from(large).toString("base64"));
});

test("[COMMON-8] canonical base64 is read as its bytes, and any other text is refused", () => {
  const texts = RULES.base64.near.filter(isString);

  fc.assert(
    fc.property(texts.filter(RULES.base64.accepts), (text) => {
      expect([...fromBase64(text)]).toStrictEqual([...Buffer.from(text, "base64")]);
    }),
  );
  fc.assert(
    fc.property(texts.filter((text) => !RULES.base64.accepts(text)), (text) => {
      expect(() => fromBase64(text)).toThrow(new RangeError("blob must be canonical base64."));
    }),
  );
  expect(fromBase64("")).toBeInstanceOf(Uint8Array);
});

test("a tree index matches ^[0-9A-Za-z]*[1-9A-Za-z]$", () => {
  expect(patternBreaking(TREE_INDEX_PATTERN, RULES.treeIndex)).toBeNull();
  expect(fieldBreaking(RULES.treeIndex)).toBeNull();
});

test("every limit is 1 to 100", () => {
  expect(fieldBreaking(RULES.limit)).toBeNull();
});

test("a key of exports is an id other than pdf", () => {
  const { schema, shape } = subject("TypeInfo");
  const format = { title: "Deck", mimeType: "application/zip", extension: "pptx" };

  expect(RESERVED_FORMAT).toBe(PDF_FORMAT);

  fc.assert(
    fc.property(shape.valid, RULES.exportFormat.near.filter(isString), (type, key) => {
      const value = withChange(type, { path: ["exports"], replacement: { [key]: format }, remove: false });

      expect(verdict(schema, value)).toBe(RULES.exportFormat.accepts(key));
    }),
  );
});

test("the version of a capability is major.minor", () => {
  expect(patternBreaking(VERSION_PATTERN, RULES.version)).toBeNull();
  fc.assert(
    fc.property(RULES.version.near, (version) => {
      const capability = withChange(capabilityExample, { path: ["version"], replacement: version, remove: false });

      expect(verdict(CapabilitySchema, capability)).toBe(RULES.version.accepts(version));
    }),
  );
});

test.each(["csp", "permissions"])("the %s of a type is a JSON object, not null, a list or text", (field) => {
  const { schema, shape } = subject("types_publish params");

  fc.assert(
    fc.property(shape.valid, fc.constantFrom<unknown>(null, [], [{}], "{}", 0, true, {}), (value, replacement) => {
      const changed = withChange(value, { path: ["content", field], replacement, remove: false });

      expect(verdict(schema, changed)).toBe(isObject(replacement));
    }),
  );
});
