import {
  ActorSchema,
  ChangeSchema,
  CommitSchema,
  DiagnosticSchema,
  DocumentSchema,
  EntrySchema,
  ErrorDataSchema,
  FileInfoSchema,
  LogRecordSchema,
  METHOD_SCHEMAS,
  NOTIFICATION_SCHEMAS,
  OpSchema,
  PageContentSchema,
  PageInfoSchema,
  PlaceSchema,
  RenderInputSchema,
  RenderResultSchema,
  type Schema,
  ScopeSchema,
  TargetSchema,
  ThreadSchema,
  TOOL_SCHEMAS,
  TreeNodeSchema,
  TypeContentSchema,
  TypeInfoSchema,
  validate,
  ViewerSchema,
} from "@agentpages/protocol";
import { toJsonSchema } from "@valibot/to-json-schema";
import { Ajv2020 } from "ajv/dist/2020.js";
import { shapeOfType, typeOfCell } from "./shapes.ts";
import { type Exchange, jsonExamples, methodRows, toolRows } from "./spec.ts";
import { isObject, type Shape } from "./values.ts";

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

export const TYPE_SCHEMAS: Record<string, Schema<unknown>> = {
  Scope: ScopeSchema,
  Actor: ActorSchema,
  Document: DocumentSchema,
  Op: OpSchema,
  Change: ChangeSchema,
  Commit: CommitSchema,
  TreeNode: TreeNodeSchema,
  Viewer: ViewerSchema,
  FileInfo: FileInfoSchema,
  ErrorData: ErrorDataSchema,
  PageInfo: PageInfoSchema,
  PageContent: PageContentSchema,
  Thread: ThreadSchema,
  Entry: EntrySchema,
  Target: TargetSchema,
  RenderInput: RenderInputSchema,
  RenderResult: RenderResultSchema,
  Place: PlaceSchema,
  Diagnostic: DiagnosticSchema,
  TypeInfo: TypeInfoSchema,
  TypeContent: TypeContentSchema,
  LogRecord: LogRecordSchema,
};

const typeSubjects: Subject[] = Object.entries(TYPE_SCHEMAS).map(([name, schema]) => ({
  name,
  shape: shapeOfType(name),
  schema,
}));

/** The tool name of a view method, by the rule of section 5.3. */
const toolNameOf = (method: string): string => method.replace("agentpages/", "").replaceAll("/", "_");

/** Section 5.3: a tool for each method of sections 4.1 and 4.4, with the same params plus `pageId`. */
const toolRowOf = (row: Exchange): Exchange => ({
  ...row,
  name: toolNameOf(row.name),
  params: `${typeOfCell(row.params)} & { pageId: string }`,
});

export const methodToolRows: Exchange[] = methodRows.filter((row) => /^4\.[14] /u.test(row.section)).map(toolRowOf);

const exchangeSubjects = (row: Exchange, schemas: Schemas): Subject[] => [
  { name: `${row.name} params`, shape: shapeOfType(typeOfCell(row.params)), schema: schemas.params },
  { name: `${row.name} result`, shape: shapeOfType(typeOfCell(row.result)), schema: schemas.result },
];

const subjectsOf = (rows: Exchange[], registry: Record<string, Schemas>): Subject[] =>
  Object.entries(registry).flatMap(([name, schemas]) =>
    rows.filter((row) => row.name === name).flatMap((row) => exchangeSubjects(row, schemas)),
  );

/** The spec's example notification, as `[method, params]`. */
export const notificationExample: [unknown, unknown][] = jsonExamples
  .filter(isObject)
  .filter((example) => "method" in example)
  .map((example) => [example.method, example.params]);

const notificationSubjects: Subject[] = Object.entries(NOTIFICATION_SCHEMAS).flatMap(([name, schemas]) =>
  notificationExample
    .filter(([method]) => method === name)
    .map(([, params]) => ({
      name: `${name} params`,
      shape: shapeOfType(typeOfCell(`{ ${Object.keys(isObject(params) ? params : {}).join(", ")} }`)),
      schema: schemas.params,
    })),
);

export const SUBJECTS: Subject[] = [
  ...typeSubjects,
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

const ajv = new Ajv2020();

/** The JSON Schema (2020-12) of a schema. Its only custom schemas are JSON objects. */
export const jsonSchemaOf = (schema: Schema<unknown>): Record<string, unknown> => ({
  ...toJsonSchema(schema, {
    target: "draft-2020-12",
    errorMode: "ignore",
    overrideSchema: ({ valibotSchema }) => (valibotSchema.type === "custom" ? { type: "object" } : undefined),
  }),
});

/** The verdict of an independent JSON Schema validator on the schema's JSON Schema. */
export const jsonSchemaVerdict = (schema: Schema<unknown>): ((value: unknown) => boolean) => {
  const check = ajv.compile(jsonSchemaOf(schema));
  return (value) => check(value);
};
