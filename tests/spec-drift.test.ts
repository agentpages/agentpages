import {
  CapabilitySchema,
  DEFAULT_LIMIT,
  DOC_ATTRIBUTE,
  ERROR_NAMES,
  ERRORS,
  EXTENSION_ID,
  type Feature,
  FEATURES,
  MAX_ATTEMPTS,
  MAX_COUNT,
  MAX_DIAGNOSTICS,
  MAX_LIMIT,
  METHOD_NOT_FOUND,
  METHOD_PREFIX,
  METHOD_SCHEMAS,
  METHODS,
  NOTIFICATION_SCHEMAS,
  NOTIFICATIONS,
  PAGE_RESOURCE_MIME_TYPE,
  pageResourceUri,
  PDF_FORMAT,
  PROTOCOL_VERSION,
  RETRY_BASE_MS,
  type Schema,
  SETTLE_QUIET_MS,
  TOOL_SCHEMAS,
  TOOL_VISIBILITY,
  TOOLS,
} from "@agentpages/protocol";
import { expect, test } from "vitest";
import { shapeOfType, typeOfCell } from "./support/shapes.ts";
import { advertised, capabilityExample, errorRows, type Exchange, methodRows, numberIn, spec, toolRows } from "./support/spec.ts";
import { jsonSchemaOf, methodToolRows, notificationExample, verdict } from "./support/subjects.ts";
import { isObject, type JsonObject, withChange } from "./support/values.ts";

const allTools: Exchange[] = [...toolRows, ...methodToolRows];

const written = (name: string, optional: boolean): string => `${name}${optional ? "?" : ""}`;

const objectAt = (value: unknown, key: string): JsonObject => {
  const child = isObject(value) ? value[key] : undefined;
  return isObject(child) ? child : {};
};

const partsOf = (schema: JsonObject): JsonObject[] =>
  Array.isArray(schema.allOf) ? schema.allOf.filter(isObject).flatMap(partsOf) : [schema];

/** The keys a schema knows, read from its JSON Schema and written as in the spec: `name` or `name?`. */
const schemaKeys = (schema: Schema<unknown>): Set<string> =>
  new Set(
    partsOf(jsonSchemaOf(schema)).flatMap((part) =>
      Object.keys(objectAt(part, "properties")).map((name) =>
        written(name, !(Array.isArray(part.required) && part.required.includes(name))),
      ),
    ),
  );

/** The keys a table cell of the spec declares. */
const cellKeys = (cell: string): Set<string> =>
  new Set(shapeOfType(typeOfCell(cell)).fields.map(({ name, optional }) => written(name, optional)));

interface Keys {
  params: Set<string>;
  result: Set<string>;
}

interface Schemas {
  params: Schema<unknown>;
  result: Schema<unknown>;
}

const knownKeys = ({ params, result }: Schemas): Keys => ({ params: schemaKeys(params), result: schemaKeys(result) });

const listedKeys = ({ params, result }: Exchange): Keys => ({ params: cellKeys(params), result: cellKeys(result) });

/** The keys of the schemas a registry has under `name`. */
const keysIn = (registry: Record<string, Schemas>, name: string): Keys[] =>
  Object.entries(registry)
    .filter(([key]) => key === name)
    .map(([, schemas]) => knownKeys(schemas));

const keysOf = (value: unknown): string[] => Object.keys(isObject(value) ? value : {});

/** The feature a method or a tool is named after, if any: `agentpages/<feature>/…` and `<feature>_…`. */
const featureOf = (group = ""): Feature[] => FEATURES.filter((feature) => feature === group);

const destinationOf = (row: Exchange): string => (row.section.includes("Requests to the view") ? "view" : "host");

/** What the spec says of a method: its feature by its group, its direction by its section, and its `opId`. */
const methodsOfSpec: [string, unknown][] = methodRows.map((row) => [
  row.name,
  { feature: featureOf(row.name.split("/")[1])[0] ?? null, to: destinationOf(row), mutates: row.params.includes("opId") },
]);

/** Section 5.5: `pages_render` needs `render`, and `pages_export` needs `render` and `files`. */
const RENDERING: Record<string, Feature[]> = { pages_render: ["render"], pages_export: ["render", "files"] };

const toolsOfSpec: [string, unknown][] = allTools.map((row) => [
  row.name,
  { requires: RENDERING[row.name] ?? featureOf(row.name.split("_")[0]), mutates: row.params.includes("opId") },
]);

test("the spec is the version the package implements", () => {
  expect(spec).toContain(`Version ${PROTOCOL_VERSION} `);
});

test("the spec advertises the package's extension, version and features", () => {
  const features = Object.fromEntries(FEATURES.map((feature) => [feature, expect.any(Object) as unknown]));

  expect(advertised).toStrictEqual({
    [EXTENSION_ID]: { version: PROTOCOL_VERSION, limits: expect.any(Object) as unknown, ...features },
  });
});

test("the capability schema knows exactly the keys of the spec's example", () => {
  const properties = objectAt(jsonSchemaOf(CapabilitySchema), "properties");
  const nested = keysOf(objectAt(capabilityExample, "limits")).map((key) => ["limits", key]);
  const removals = [["version"], ["limits"], ...nested].map((path) => ({ path, replacement: null, remove: true }));

  expect(verdict(CapabilitySchema, capabilityExample)).toBe(true);
  expect(removals.map((removal) => verdict(CapabilitySchema, withChange(capabilityExample, removal)))).not.toContain(true);
  expect(Object.keys(properties)).toStrictEqual(keysOf(capabilityExample));
});

test.each(["limits", ...FEATURES])("the capability schema requires exactly the spec's keys of %s", (group) => {
  const example = objectAt(capabilityExample, group);
  const removals = Object.keys(example).map((key) => ({ path: [group, key], replacement: null, remove: true }));
  const properties = objectAt(jsonSchemaOf(CapabilitySchema), "properties");

  expect(Object.keys(objectAt(objectAt(properties, group), "properties"))).toStrictEqual(Object.keys(example));
  expect(removals.map((removal) => verdict(CapabilitySchema, withChange(capabilityExample, removal)))).not.toContain(true);
});

test("the registry has exactly the methods of the spec's tables, each with a tag", () => {
  expect(Object.entries(METHODS)).toStrictEqual(methodsOfSpec);
  expect(Object.keys(METHOD_SCHEMAS)).toStrictEqual(Object.keys(METHODS));
  expect(Object.keys(METHODS).filter((name) => !name.startsWith(METHOD_PREFIX))).toStrictEqual([]);
  expect(new Set(methodRows.map((row) => row.tag)).size).toBe(methodRows.length);
});

test.each(methodRows)("the schemas of $name know exactly the keys the spec lists", (row) => {
  expect(keysIn(METHOD_SCHEMAS, row.name)).toStrictEqual([listedKeys(row)]);
});

test("the registry has exactly the notification of the spec's example", () => {
  const [[method, params] = []] = notificationExample;

  expect(NOTIFICATIONS).toStrictEqual({ [String(method)]: { feature: "state", to: "view" } });
  expect(schemaKeys(NOTIFICATION_SCHEMAS["agentpages/state/committed"].params)).toStrictEqual(new Set(keysOf(params)));
});

test("the registry has exactly the tools of the spec's tables and of its state and files methods", () => {
  expect(new Map(Object.entries(TOOLS))).toStrictEqual(new Map(toolsOfSpec));
  expect(new Set(Object.keys(TOOL_SCHEMAS))).toStrictEqual(new Set(Object.keys(TOOLS)));
  expect(new Set(toolRows.map((row) => row.tag)).size).toBe(toolRows.length);
});

test.each(allTools)("the schemas of $name know exactly the keys the spec lists", (row) => {
  expect(keysIn(TOOL_SCHEMAS, row.name)).toStrictEqual([listedKeys(row)]);
});

test("the errors are exactly the rows of the spec's table", () => {
  const rows = ERROR_NAMES.map((name) => ({ name, ...ERRORS[name] }));

  expect(rows).toStrictEqual(errorRows);
  expect(Object.keys(ERRORS)).toStrictEqual([...ERROR_NAMES]);
  expect(spec).toContain(`JSON-RPC error \`${METHOD_NOT_FOUND}\``);
});

test("the constants are the ones the spec states", () => {
  const resource = /MCP resource at `([^`]+)`/u.exec(spec)?.[1];

  expect(spec).toContain(`use the prefix \`${METHOD_PREFIX}\``);
  expect(spec).toContain(`\`${DOC_ATTRIBUTE}="<collection>/<id>"\``);
  expect(spec).toContain(`With \`format: "${PDF_FORMAT}"\``);
  expect(spec).toContain(`MIME type \`${PAGE_RESOURCE_MIME_TYPE}\``);
  expect(pageResourceUri({ pageId: "{pageId}", version: 7 })).toBe(resource?.replace("{version}", "7"));
  expect(spec).toContain(`\`_meta.ui.visibility: ${JSON.stringify(TOOL_VISIBILITY)}\``);
});

test("the numbers are the ones the spec states", () => {
  expect(MAX_DIAGNOSTICS).toBe(numberIn(/At most (\d+) diagnostics/u));
  expect(SETTLE_QUIET_MS).toBe(numberIn(/pending for (\d+) milliseconds/u));
  expect(RETRY_BASE_MS).toBe(numberIn(/between 0 and `(\d+) × 2ⁿ` milliseconds/u));
  expect(MAX_ATTEMPTS).toBe(numberIn(/stops after (\d+) attempts/u));
  expect(MAX_LIMIT).toBe(numberIn(/Every `limit` is 1 to (\d+)/u));
  expect(DEFAULT_LIMIT).toBe(numberIn(/and defaults to (\d+)\./u));
  expect(MAX_COUNT).toBe(2 ** numberIn(/integers from 0 to 2\^(\d+) − 1/u) - 1);
});
