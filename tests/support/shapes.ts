import { parseSync, type TSSignature, type TSType, type TSTypeReference } from "oxc-parser";
import { RULES, type RuleName } from "./rules.ts";
import { ANYTHING, array, type Field, format, literal, object, record, type Shape, simple, union } from "./values.ts";
import { typeBlocks } from "./spec.ts";

/** Section 2.1 of the spec: the rule a field follows, by its name. */
const FIELD_RULES: Record<string, RuleName> = {
  collection: "id",
  id: "id",
  typeId: "id",
  fileId: "id",
  threadId: "id",
  pageId: "uuid",
  opId: "uuid",
  updatedAt: "timestamp",
  createdAt: "timestamp",
  at: "timestamp",
  seq: "count",
  since: "count",
  revision: "count",
  ifRevision: "count",
  version: "count",
  baseVersion: "count",
  typeVersion: "count",
  size: "count",
  "viewport.width": "count",
  "viewport.height": "count",
  y: "count",
  title: "name",
  name: "name",
  mimeType: "name",
  description: "description",
  quote: "description",
  body: "body",
  instructions: "body",
  blob: "base64",
  limit: "limit",
  index: "treeIndex",
};

/** The keys of these maps are ids. A key of `exports` is also not `pdf`. */
const KEY_RULES: Record<string, RuleName> = { collections: "id", exports: "exportFormat" };

/** Fields the tables use in shorthand and no `ts` block declares. */
const UNDECLARED_FIELDS: Record<string, string> = {
  cursor: "string",
  limit: "number",
  since: "number",
  blob: "string",
  baseVersion: "number",
  threadId: "string",
  fileId: "string",
  commit: "Commit",
  format: "string",
};

const KEYWORDS: Record<string, string> = {
  TSStringKeyword: "string",
  TSNumberKeyword: "number",
  TSBooleanKeyword: "boolean",
  TSNullKeyword: "null",
  TSUnknownKeyword: "unknown",
};

const OPAQUE: Shape = record(ANYTHING);

const declaredFields = new Map(
  [...typeBlocks.matchAll(/^ {2}(\w+)\??: (.+);$/gmu)].map((match) => [match[1] ?? "", match[2] ?? ""]),
);

const fieldType = (name: string): string => {
  const type = declaredFields.get(name) ?? UNDECLARED_FIELDS[name];
  if (type === undefined) throw new Error(`The spec never gives ${name} a type.`);
  return type;
};

/** Writes a table cell such as `{ scope, cursor? }` as a TypeScript type. */
export const typeOfCell = (cell: string): string =>
  cell.replaceAll(/(?<=[{,]\s*)(\w+)(\??)(?=\s*[,}])/gu, (_, ...[name = "", optional = ""]: string[]) =>
    `${name}${optional}: ${fieldType(name)}`,
  );

const declarations = new Map<string, TSType | TSSignature[]>();

parseSync("spec.ts", typeBlocks).program.body.forEach((statement) => {
  if (statement.type === "TSTypeAliasDeclaration") declarations.set(statement.id.name, statement.typeAnnotation);
  if (statement.type === "TSInterfaceDeclaration") declarations.set(statement.id.name, statement.body.body);
});

export const declaredNames: string[] = [...declarations.keys()];

const ruled = (shape: Shape, rule: RuleName | undefined): Shape =>
  rule !== undefined && shape.kind === RULES[rule].base ? format(rule) : shape;

const keyed = (shape: Shape, rule: RuleName | undefined): Shape =>
  rule !== undefined && shape.kind === "record" && shape.item !== undefined ? record(shape.item, RULES[rule]) : shape;

const fieldOf = (member: TSSignature, parent: string): Field[] => {
  if (member.type !== "TSPropertySignature" || member.key.type !== "Identifier") return [];
  if (member.typeAnnotation === null) throw new Error("A field without a type.");
  const { name } = member.key;
  const shape = keyed(shapeOf(member.typeAnnotation.typeAnnotation, name), KEY_RULES[name]);
  return [{ name, optional: member.optional, shape: ruled(shape, FIELD_RULES[`${parent}.${name}`] ?? FIELD_RULES[name]) }];
};

const objectOf = (members: TSSignature[], parent: string): Shape =>
  object(members.flatMap((member) => fieldOf(member, parent)));

const literalValue = (node: TSType | undefined): unknown =>
  node?.type === "TSLiteralType" && node.literal.type === "Literal" ? node.literal.value : undefined;

const named = (name: string): Shape => {
  const declared = declarations.get(name);
  if (declared === undefined) return OPAQUE;
  return Array.isArray(declared) ? objectOf(declared, name) : shapeOf(declared, name);
};

const referenceOf = (node: TSTypeReference, parent: string): Shape => {
  const name = node.typeName.type === "Identifier" ? node.typeName.name : "";
  const [first, second] = node.typeArguments?.params ?? [];
  if (name === "Record" && second !== undefined) return record(shapeOf(second, parent));
  if (name === "Omit" && first !== undefined) {
    return object(shapeOf(first, parent).fields.filter((field) => field.name !== literalValue(second)));
  }
  return named(name);
};

const compositeOf = (node: TSType, parent: string): Shape => {
  if (node.type === "TSArrayType") return array(shapeOf(node.elementType, parent));
  if (node.type === "TSUnionType") return union(node.types.map((option) => shapeOf(option, parent)));
  if (node.type === "TSIntersectionType") return object(node.types.flatMap((part) => shapeOf(part, parent).fields));
  if (node.type === "TSLiteralType") return literal(literalValue(node));
  if (node.type === "TSTypeLiteral") return objectOf(node.members, parent);
  if (node.type === "TSTypeReference") return referenceOf(node, parent);
  throw new Error(`The spec uses ${node.type}, which these tests do not understand.`);
};

function shapeOf(node: TSType, parent: string): Shape {
  return simple(KEYWORDS[node.type] ?? "") ?? compositeOf(node, parent);
}

/** The shape of a type written in the spec, such as `Document` or `{ file: FileInfo }`. */
export const shapeOfType = (type: string): Shape => {
  const [statement] = parseSync("cell.ts", `type Cell = ${type};`).program.body;
  if (statement?.type !== "TSTypeAliasDeclaration") throw new Error(`Not a type: ${type}`);
  return shapeOf(statement.typeAnnotation, "");
};
