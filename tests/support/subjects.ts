import {
  CapabilitySchema,
  LogRecordSchema,
  METHOD_SCHEMAS,
  NOTIFICATION_SCHEMAS,
  type Schema,
  TOOL_SCHEMAS,
  toolInputSchema,
  type ToolName,
  TOOLS,
  TreeNodeSchema,
  TypeInfoSchema,
  validate,
} from "@agentpages/protocol";
import { Ajv2020 } from "ajv/dist/2020.js";
import { isObject } from "./json.ts";
import { shapeOfType, typeOfCell } from "./shapes.ts";
import { capabilityExample, type Exchange, jsonExamples, methodRows, toolRows, typeOfExample } from "./spec.ts";
import type { Shape } from "./values.ts";

/** One place where the spec declares a shape and the package exports its schema. */
export interface Subject {
  name: string;
  shape: Shape;
  schema: Schema<unknown>;
}

interface Schemas {
  params: Schema<unknown>;
  result: Schema<unknown>;
}

/** The schemas the package exports on their own, by the name of the type the spec declares. */
const TYPE_SCHEMAS: Record<string, Schema<unknown>> = {
  TreeNode: TreeNodeSchema,
  TypeInfo: TypeInfoSchema,
  LogRecord: LogRecordSchema,
};

const typeSubjects: Subject[] = Object.entries(TYPE_SCHEMAS).map(([name, schema]) => ({
  name,
  shape: shapeOfType(name),
  schema,
}));

/** Section 3 gives the capability as an example, not as a type. */
const capabilitySubject: Subject = {
  name: "Capability",
  shape: shapeOfType(typeOfExample(capabilityExample), "Capability"),
  schema: CapabilitySchema,
};

/** The tool name of a view method, by the rule of section 5.3. */
const toolNameOf = (method: string): string => method.replace("agentpages/", "").replaceAll("/", "_");

const toolRowOf = (row: Exchange): Exchange => ({
  ...row,
  name: toolNameOf(row.name),
  params: `${typeOfCell(row.params)} & { pageId: string }`,
});

/** Section 5.3: a tool for each method of sections 4.1 and 4.4, with the same params plus `pageId`. */
export const methodToolRows: Exchange[] = methodRows.filter((row) => /^4\.[14] /u.test(row.section)).map(toolRowOf);

/** A schema looked up only when it is used, so that a registry with a hole in it fails the test that needs it. */
const later = (find: () => Schema<unknown>): Schema<unknown> => ({
  "~standard": { version: 1, vendor: "agentpages", validate: (input) => find()["~standard"].validate(input) },
});

const exchangeSubjects = (row: Exchange, schemas: Schemas): Subject[] => [
  { name: `${row.name} params`, shape: shapeOfType(typeOfCell(row.params)), schema: later(() => schemas.params) },
  { name: `${row.name} result`, shape: shapeOfType(typeOfCell(row.result)), schema: later(() => schemas.result) },
];

const subjectsOf = (rows: Exchange[], registry: Record<string, Schemas>): Subject[] =>
  Object.entries(registry).flatMap(([name, schemas]) =>
    rows.filter((row) => row.name === name).flatMap((row) => exchangeSubjects(row, schemas)),
  );

/** The method of the spec's example notification. Section 4.1: its params are a `Committed`. */
export const notificationExample: unknown[] = jsonExamples
  .filter(isObject)
  .filter((example) => "method" in example)
  .map((example) => example.method);

const notificationSubjects: Subject[] = Object.entries(NOTIFICATION_SCHEMAS).map(([name, schemas]) => ({
  name: `${name} params`,
  shape: shapeOfType("Committed"),
  schema: schemas.params,
}));

export const SUBJECTS: Subject[] = [
  ...typeSubjects,
  capabilitySubject,
  ...subjectsOf(methodRows, METHOD_SCHEMAS),
  ...notificationSubjects,
  ...subjectsOf([...toolRows, ...methodToolRows], TOOL_SCHEMAS),
];

export const subject = (name: string): Subject => {
  const found = SUBJECTS.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`The spec declares no ${name}.`);
  return found;
};

export const verdict = (schema: Schema<unknown>, value: unknown): boolean => validate(schema, value).ok;

/** What the package makes of a value: its parsed form, or nothing when it rejects it. */
export const parsed = (schema: Schema<unknown>, value: unknown): unknown => {
  const result = validate(schema, value);
  return result.ok ? result.value : undefined;
};

const ajv = new Ajv2020();

const isToolName = (name: string): name is ToolName => Object.hasOwn(TOOLS, name);

export const TOOL_NAMES: ToolName[] = Object.keys(TOOLS).filter(isToolName);

/** The verdict of an independent JSON Schema validator on the input schema a tool advertises. */
export const inputSchemaVerdict = (tool: ToolName): ((value: unknown) => boolean) => {
  const check = ajv.compile(toolInputSchema(tool));
  return (value) => check(value);
};
