import { type Op, type Problem, TOOL_SCHEMAS, type TypeInfo } from "@agentpages/protocol";
import { currentContent, type Page } from "../pages/records.js";
import { corrupt, parsed } from "../pipeline/index.js";
import type { CompiledSchema, SchemaCompiler } from "../ports/compiler.js";
import type { Reader } from "@agentpages/storage";
import { typeVersionKey } from "./keys.js";

type Checks = Map<string, CompiledSchema>;

/** A schema that was valid when its type was published compiles. */
const compiledBy =
  (compiler: SchemaCompiler) =>
  ([name, { schema }]: [string, TypeInfo["collections"][string]]): [string, CompiledSchema] => {
    const compiled = compiler.compile(schema);
    return [name, "error" in compiled ? corrupt() : compiled];
  };

/** What is wrong with an op on a page of a type. Only a put brings data, so only a put is checked. */
const wrongWith = (op: Op, checks: Checks): string | undefined => {
  if (op.op === "delete") return undefined;
  const check = checks.get(op.collection);
  if (check === undefined) return `the type does not declare the collection ${op.collection}`;
  const [issue] = check.check(op.data);
  return issue && `${["data", ...(issue.path ?? [])].join(".")}: ${issue.message}`;
};

const firstMisfit = (ops: Op[], checks: Checks): Problem | undefined =>
  ops
    .flatMap((op, opIndex): Problem[] => {
      const wrong = wrongWith(op, checks);
      return wrong === undefined ? [] : [{ error: "InvalidParams", message: `op ${opIndex}: ${wrong}`, opIndex }];
    })
    .at(0);

export interface Fitting {
  page: Page;
  ops: Op[];
  compiler: SchemaCompiler;
}

/**
 * Section 6 of the spec: the first put that the type version the page names now does not allow, because the type does
 * not declare its collection or its data does not match the schema. A page of html allows everything.
 */
export const misfit = async (tx: Reader, { page, ops, compiler }: Fitting): Promise<Problem | undefined> => {
  const content = await currentContent(tx, page);
  if (content.kind !== "type") return undefined;
  const { collections } = parsed(TOOL_SCHEMAS.types_get.result, await tx.get(typeVersionKey(content)));
  return firstMisfit(ops, new Map(Object.entries(collections).map(compiledBy(compiler))));
};
