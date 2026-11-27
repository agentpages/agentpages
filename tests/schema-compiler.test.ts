import { ajvSchemaCompiler, type CompiledSchema } from "@agentpages/server";
import { expect, test, vi } from "vitest";

const compiled = (schema: Record<string, unknown>): CompiledSchema => {
  const result = ajvSchemaCompiler.compile(schema);
  if ("error" in result) throw new Error(result.message);
  return result;
};

const problemOf = (schema: Record<string, unknown>): unknown => ajvSchemaCompiler.compile(schema);

const malformed = { error: "InvalidParams", message: expect.stringMatching(/^It is not valid JSON Schema 2020-12 that stands alone\. \w*Error: /u) as unknown };

test("[TYPES-14] a compiled schema says what is wrong with data, and where, never what the data was", () => {
  const task = compiled({
    type: "object",
    required: ["title"],
    properties: { title: { type: "string" }, tags: { type: "array", items: { type: "number" } }, owner: { const: "alice" } },
  });

  expect(task.check({ title: "Write", tags: [1, 2], owner: "alice" })).toStrictEqual([]);
  expect(task.check({ tags: [1, "private text"], owner: "mallory" })).toStrictEqual([
    { message: "must have required property 'title'", path: [] },
    { message: "must be number", path: ["tags", "1"] },
    { message: "must be equal to constant", path: ["owner"] },
  ]);
  expect(task.check("private text")).toStrictEqual([{ message: "must be object", path: [] }]);
});

test("[TYPES-14] a schema that is not valid JSON Schema 2020-12 is a problem", () => {
  const broken = [{ type: "text" }, { minimum: "1" }, { properties: [] }, { notAKeyword: true }, { type: "string", pattern: "(" }];

  expect(broken.map(problemOf)).toStrictEqual(broken.map(() => malformed));
});

test("[TYPES-14] a schema that refers to anything outside itself is a problem, another schema of the same type included", () => {
  const address = { $id: "https://schemas.example/address", type: "string" };

  expect(problemOf(address)).toStrictEqual({ check: expect.any(Function) as unknown });
  expect(problemOf({ $ref: "https://schemas.example/address" })).toStrictEqual(malformed);
  expect(problemOf({ properties: { home: { $ref: "address" } } })).toStrictEqual(malformed);
  expect(compiled({ $defs: { name: { type: "string" } }, $ref: "#/$defs/name" }).check(7)).toStrictEqual([
    { message: "must be string", path: [] },
  ]);
});

test("[TYPES-14] a schema that is valid is accepted as it is, and nothing is written to the console", () => {
  const written = vi.spyOn(console, "warn");
  const lenient = [
    { properties: { title: {} }, required: ["missing"] },
    { type: "array", prefixItems: [{ type: "number" }] },
    { type: ["string", "null"], minLength: 1 },
    { type: "string", format: "email" },
    { type: "string", format: "a format nobody defined" },
  ];

  expect(lenient.map((schema) => compiled(schema).check("not an email"))).toStrictEqual([[], [{ message: "must be array", path: [] }], [], [], []]);
  expect(written).not.toHaveBeenCalled();
});
