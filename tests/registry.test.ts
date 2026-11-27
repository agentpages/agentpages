import {
  CapabilitySchema,
  type Feature,
  FEATURES,
  hasFeature,
  isFeature,
  METHOD_SCHEMAS,
  TOOL_SCHEMAS,
  toolName,
  TOOLS,
  validate,
} from "@agentpages/protocol";
import { expect, test } from "vitest";
import * as fc from "fast-check";
import { RULES } from "./support/rules.ts";
import { capabilityExample, methodRows, spec } from "./support/spec.ts";
import { methodToolRows, parsed, subject, SUBJECTS, verdict } from "./support/subjects.ts";
import { isObject } from "./support/json.ts";
import { near, type Shape, withChange } from "./support/values.ts";

const STORE_METHODS = [
  "agentpages/state/get",
  "agentpages/state/list",
  "agentpages/state/commit",
  "agentpages/state/commits",
  "agentpages/files/put",
  "agentpages/files/get",
  "agentpages/files/list",
  "agentpages/files/delete",
] as const;

const listedToolNames: string[] = (/replaces `\/` with `_`: (.+)\. `\[TOOLS-1\]`/u.exec(spec)?.[1] ?? "")
  .replaceAll("`", "")
  .split(", ");

test("[TOOLS-1] the tool of a state or files method drops agentpages/ and replaces / with _", () => {
  const stateAndFiles = methodRows.filter((row) => /^4\.[14] /u.test(row.section)).map((row) => row.name);

  expect(STORE_METHODS).toStrictEqual(stateAndFiles);
  expect(STORE_METHODS.map(toolName)).toStrictEqual(listedToolNames);
  expect(STORE_METHODS.map(toolName)).toStrictEqual(methodToolRows.map((row) => row.name));
  expect(Object.keys(TOOLS)).toStrictEqual(expect.arrayContaining(listedToolNames));
});

const withPageId = (params: unknown, pageId: unknown): unknown => (isObject(params) ? { ...params, pageId } : params);

test.each(STORE_METHODS)("[TOOLS-1] the tool of %s takes the same params plus pageId and returns the same result", (method) => {
  const tool = TOOL_SCHEMAS[toolName(method)];
  const params = subject(`${method} params`);
  const result = subject(`${method} result`);
  const calls = fc.record({ input: near(params.shape), pageId: RULES.uuid.near, output: near(result.shape) });

  fc.assert(
    fc.property(calls, ({ input, pageId, output }) => {
      expect(verdict(tool.params, withPageId(input, pageId))).toBe(
        [params.shape.accepts(input), RULES.uuid.accepts(pageId)].every(Boolean),
      );
      expect(verdict(tool.params, input)).toBe(false);
      expect(verdict(tool.result, output)).toBe(verdict(METHOD_SCHEMAS[method].result, output));
    }),
  );
});

const without = (capability: unknown, feature: Feature): unknown =>
  withChange(capability, { path: [feature], replacement: null, remove: true });

/** The features of a capability the package validated, or nothing when it rejected it. */
const availableIn = (advertised: unknown): Feature[] => {
  const capability = validate(CapabilitySchema, advertised);
  if (!capability.ok) throw new Error("The spec's example with some features left out is a capability.");
  return FEATURES.filter((feature) => hasFeature(capability.value, feature));
};

test("[EXT-3] a feature is available exactly when its key is present", () => {
  fc.assert(
    fc.property(fc.subarray([...FEATURES]), (absent) => {
      const advertised = absent.reduce(without, capabilityExample);

      expect(availableIn(advertised)).toStrictEqual(FEATURES.filter((feature) => !absent.includes(feature)));
    }),
  );
});

test("[EXT-3] state, identity, files and render are the features", () => {
  expect(/- (.+) are features\./u.exec(spec)?.[1]?.replaceAll("`", "").split(/, | and /u)).toStrictEqual([...FEATURES]);
  expect(FEATURES.every(isFeature)).toBe(true);
  expect(isFeature("camera")).toBe(false);
});

const unknownFields = fc.dictionary(fc.string().map((name) => `x-${name}`), fc.jsonValue(), { minKeys: 1, maxKeys: 2 });

interface Unknowns {
  shape: Shape;
  extra: Record<string, unknown>;
}

const optionFor = (shape: Shape, value: unknown): Shape =>
  shape.options?.find((option) => option.accepts(value)) ?? shape;

const shapeUnder = (shape: Shape, name: string): Shape =>
  shape.fields.find((field) => field.name === name)?.shape ?? shape.item ?? shape;

/** `value` with fields the spec does not know added to every object the shape declares. */
const withUnknownFields = (value: unknown, { shape, extra }: Unknowns): unknown => {
  const chosen = optionFor(shape, value);
  if (Array.isArray(value)) {
    return value.map((item: unknown) => withUnknownFields(item, { shape: chosen.item ?? chosen, extra }));
  }
  if (!isObject(value)) return value;
  const known = Object.entries(value).map(([name, child]) => [
    name,
    withUnknownFields(child, { shape: shapeUnder(chosen, name), extra }),
  ]);
  return { ...Object.fromEntries(known), ...(chosen.kind === "object" && chosen.open !== true ? extra : {}) };
};

test.each(SUBJECTS)("[VER-1] fields the spec does not know never change whether $name is valid", ({ shape, schema }) => {
  fc.assert(
    fc.property(near(shape), unknownFields, (value, extra) => {
      expect(verdict(schema, withUnknownFields(value, { shape, extra }))).toBe(verdict(schema, value));
    }),
  );
});

test.each(SUBJECTS)("[VER-1] fields the spec does not know are left out of a validated $name", ({ shape, schema }) => {
  fc.assert(
    fc.property(shape.valid, unknownFields, (value, extra) => {
      expect(parsed(schema, withUnknownFields(value, { shape, extra }))).toEqual(value);
    }),
  );
});
