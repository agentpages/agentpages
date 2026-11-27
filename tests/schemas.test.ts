import * as fc from "fast-check";
import { expect, test } from "vitest";
import { declaredNames } from "./support/shapes.ts";
import { methodRows, toolRows } from "./support/spec.ts";
import { jsonSchemaVerdict, methodToolRows, SUBJECTS, type Subject, TYPE_SCHEMAS, verdict } from "./support/subjects.ts";
import { near } from "./support/values.ts";

/** The JSON Schema of a map cannot say that `constructor` is a key like any other. */
const HAS_ID_KEYED_MAPS = /^(?:TypeInfo|types_\w+ result|types_publish params)$/u;

const convertible: Subject[] = SUBJECTS.filter((subject) => !HAS_ID_KEYED_MAPS.test(subject.name));

test("every type, method, notification and tool of the spec has a schema", () => {
  const exchanges = [...methodRows, ...toolRows, ...methodToolRows].flatMap((row) => [
    `${row.name} params`,
    `${row.name} result`,
  ]);
  const declared = [...declaredNames, ...exchanges, "agentpages/state/committed params"];

  expect(Object.keys(TYPE_SCHEMAS)).toStrictEqual(declaredNames);
  expect(new Set(SUBJECTS.map((subject) => subject.name))).toStrictEqual(new Set(declared));
  expect(SUBJECTS).toHaveLength(declared.length);
});

test.each(SUBJECTS)("the schema of $name accepts exactly what the spec declares", ({ shape, schema }) => {
  fc.assert(
    fc.property(near(shape), (value) => {
      expect(verdict(schema, value)).toBe(shape.accepts(value));
    }),
  );
});

test.each(convertible)("the JSON Schema of $name accepts exactly what the spec declares", ({ shape, schema }) => {
  const accepts = jsonSchemaVerdict(schema);

  fc.assert(
    fc.property(near(shape), (value) => {
      expect(accepts(value)).toBe(shape.accepts(value));
    }),
  );
});
