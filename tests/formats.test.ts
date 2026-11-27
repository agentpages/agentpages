import {
  BASE64_PATTERN,
  BODY_PATTERN,
  CapabilitySchema,
  DESCRIPTION_PATTERN,
  ID_PATTERN,
  NAME_PATTERN,
  PDF_FORMAT,
  type Schema,
  TIMESTAMP_PATTERN,
  TREE_INDEX_PATTERN,
  UUID_PATTERN,
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

/** A value on which the exported pattern and an independent reading of the rule disagree. */
const patternBreaking = (pattern: RegExp, rule: Rule): unknown =>
  fc.check(
    fc.property(rule.near, (value) => (typeof value === "string" && pattern.test(value)) === rule.accepts(value)),
    { numRuns: 1000 },
  ).counterexample;

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
  expect(patternBreaking(BASE64_PATTERN, RULES.base64)).toBeNull();
  expect(fieldBreaking(RULES.base64)).toBeNull();
});

test("[TREE-2] a tree index matches ^[0-9A-Za-z]*[1-9A-Za-z]$", () => {
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
