import { toolInputSchema } from "@agentpages/protocol";
import * as fc from "fast-check";
import { expect, test } from "vitest";
import { isObject } from "./support/json.ts";
import { shapeOfType } from "./support/shapes.ts";
import { methodRows, numberIn, toolRows } from "./support/spec.ts";
import {
  inputSchemaVerdict,
  methodToolRows,
  parsed,
  subject,
  SUBJECTS,
  TOOL_NAMES,
  verdict,
} from "./support/subjects.ts";
import { near, withChange } from "./support/values.ts";

/** A map keyed by id is a plain object in JSON Schema, which cannot say what its keys and values are. */
const HAS_ID_KEYED_MAPS = new Set(["types_publish"]);

const exact = TOOL_NAMES.filter((tool) => !HAS_ID_KEYED_MAPS.has(tool));

const standalone = ["TreeNode", "TypeInfo", "LogRecord", "Capability", "agentpages/state/committed params"];

test("every method, notification and tool of the spec has a schema", () => {
  const exchanges = [...methodRows, ...toolRows, ...methodToolRows].flatMap((row) => [
    `${row.name} params`,
    `${row.name} result`,
  ]);

  expect(new Set(SUBJECTS.map((candidate) => candidate.name))).toStrictEqual(new Set([...standalone, ...exchanges]));
  expect(SUBJECTS).toHaveLength(standalone.length + exchanges.length);
});

test.each(SUBJECTS)("the schema of $name accepts exactly what the spec declares", ({ shape, schema }) => {
  fc.assert(
    fc.property(near(shape), (value) => {
      expect(verdict(schema, value)).toBe(shape.accepts(value));
    }),
  );
});

test.each(SUBJECTS)("the schema of $name returns a valid value as it was given", ({ shape, schema }) => {
  fc.assert(
    fc.property(shape.valid, (value) => {
      expect(parsed(schema, structuredClone(value))).toEqual(value);
    }),
  );
});

test.each(exact)("the input schema of %s accepts exactly what the spec declares", (tool) => {
  const { shape } = subject(`${tool} params`);
  const accepts = inputSchemaVerdict(tool);

  fc.assert(
    fc.property(near(shape), (value) => {
      expect(accepts(value)).toBe(shape.accepts(value));
    }),
  );
});

test.each(TOOL_NAMES)("the input schema of %s is JSON Schema 2020-12 and accepts every valid input", (tool) => {
  const { shape } = subject(`${tool} params`);
  const accepts = inputSchemaVerdict(tool);

  expect(toolInputSchema(tool)).toMatchObject({ $schema: "https://json-schema.org/draft/2020-12/schema" });
  fc.assert(
    fc.property(shape.valid, (value) => {
      expect(accepts(value)).toBe(true);
    }),
  );
});

interface Listed {
  value: unknown;
  item: unknown;
  count: number;
}

/** A valid result of a tool, a valid item for one of its lists, and how many of that item to put there. */
const listed = (result: string, item: string) => (counts: number[]): fc.Arbitrary<Listed> =>
  fc.record({
    value: subject(result).shape.valid,
    item: shapeOfType(item).valid,
    count: fc.constantFrom(...counts),
  });

const withList = ({ value, item, count }: Listed, field: string): unknown =>
  withChange(value, { path: [field], replacement: Array.from({ length: count }, () => item), remove: false });

test("a thread has at least one entry", () => {
  const { schema } = subject("comments_reply result");

  fc.assert(
    fc.property(listed("comments_reply result", "Entry")([0, 1, 2]), (thread) => {
      expect(verdict(schema, withList(thread, "entries"))).toBe(thread.count >= 1);
    }),
  );
});

test("a render returns no more diagnostics than the spec allows", () => {
  const most = numberIn(/At most (\d+) diagnostics are returned/u);
  const { schema } = subject("pages_render result");

  fc.assert(
    fc.property(listed("pages_render result", "Diagnostic")([0, most - 1, most, most + 1]), (render) => {
      expect(verdict(schema, withList(render, "diagnostics"))).toBe(render.count <= most);
    }),
  );
});

const OP_ID = "0b1f4c7e-52a9-4d38-8e6f-a1c2d3e4f5a6";

test("an input schema says that document data and a map of collections are objects", () => {
  const commit = inputSchemaVerdict("state_commit");
  const publish = inputSchemaVerdict("types_publish");
  const type = subject("types_publish params").shape.valid;

  fc.assert(
    fc.property(type, fc.constantFrom<unknown>(null, [], "{}", 1, {}), (params, data) => {
      const ops = [{ op: "put", collection: "tasks", id: "one", data }];

      expect(commit({ scope: "page", opId: OP_ID, pageId: OP_ID, ops })).toBe(isObject(data));
      expect(publish(withChange(params, { path: ["collections"], replacement: data, remove: false }))).toBe(isObject(data));
    }),
  );
});
