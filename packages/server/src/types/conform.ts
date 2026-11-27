import { type Op, type Problem, TOOL_SCHEMAS, type TypeInfo, TreeNodeSchema, TypeInfoSchema, validate } from "@agentpages/protocol";
import { currentContent, type Page } from "../pages/records.js";
import { parsed } from "../pipeline/index.js";
import type { CompiledSchema } from "../ports/compiler.js";
import type { Reader } from "@agentpages/storage";
import type { Checks } from "./checks.js";
import { declaredKey, typeVersionKey } from "./keys.js";

/** What checks the data of a collection. Nothing when the type does not declare the collection. */
type CheckOf = (collection: string) => CompiledSchema | undefined;

/** What is wrong with an op on a page of a type. Only a put brings data, so only a put is checked. */
const wrongWith = (op: Op, checkOf: CheckOf): string | undefined => {
  if (op.op === "delete") return undefined;
  const check = checkOf(op.collection);
  if (check === undefined) return `the type does not declare the collection ${op.collection}`;
  const [issue] = check.check(op.data);
  return issue && `${["data", ...(issue.path ?? [])].join(".")}: ${issue.message}`;
};

const firstMisfit = (ops: Op[], checkOf: CheckOf): Problem | undefined =>
  ops
    .flatMap((op, opIndex): Problem[] => {
      const wrong = wrongWith(op, checkOf);
      return wrong === undefined ? [] : [{ error: "InvalidParams", message: `op ${opIndex}: ${wrong}`, opIndex }];
    })
    .at(0);

export interface Fitting {
  page: Page;
  ops: Op[];
  checks: Checks;
}

/** What the type of a page makes of a commit: the first put it does not allow, and its collections that are trees. */
export interface Typed {
  wrong: Problem | undefined;
  trees: ReadonlySet<string>;
}

/** A page of html allows everything, and has no trees. */
export const UNTYPED: Typed = { wrong: undefined, trees: new Set() };

/** Section 4.2 of the spec: the data of a tree document carries its position. */
const asNode = (schema: CompiledSchema): CompiledSchema => ({
  check: (data) => {
    const node = validate(TreeNodeSchema, data);
    return [...schema.check(data), ...(node.ok ? [] : node.issues)];
  },
});

type Collections = TypeInfo["collections"];

/** A collection is a tree in every version of its type, so it is one even while the version of the page leaves it out. */
const treesIn = (collections: Collections): Set<string> =>
  new Set(
    Object.entries(collections)
      .filter(([, { tree }]) => tree === true)
      .map(([name]) => name),
  );

/**
 * Section 6 of the spec: the first put that the type version the page names now does not allow, because the type does
 * not declare its collection, its data does not match the schema, or it is no tree node in a collection that is a
 * tree. Only the schemas of the collections that the puts name are compiled.
 */
export const misfit = async (tx: Reader, { page, ops, checks }: Fitting): Promise<Typed> => {
  const content = await currentContent(tx, page);
  if (content.kind !== "type") return UNTYPED;
  const [named, every] = await tx.getMany([typeVersionKey(content), declaredKey(content.typeId)]);
  const { typeId, version, collections } = parsed(TOOL_SCHEMAS.types_get.result, named);
  const trees = treesIn(parsed(TypeInfoSchema, every).collections);
  const declared = new Map(Object.entries(collections));
  const wrong = firstMisfit(ops, (collection) => {
    const found = declared.get(collection);
    const check = found && checks.of({ typeId, version, collection }, found.schema);
    return check && trees.has(collection) ? asNode(check) : check;
  });
  return { wrong, trees };
};
