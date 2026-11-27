import { type Op, type Problem, TOOL_SCHEMAS } from "@agentpages/protocol";
import { currentContent, type Page } from "../pages/records.js";
import { parsed } from "../pipeline/index.js";
import type { CompiledSchema } from "../ports/compiler.js";
import type { Reader } from "@agentpages/storage";
import type { Checks } from "./checks.js";
import { typeVersionKey } from "./keys.js";

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

/**
 * Section 6 of the spec: the first put that the type version the page names now does not allow, because the type does
 * not declare its collection or its data does not match the schema. Only the schemas of the collections that the puts
 * name are compiled. A page of html allows everything.
 */
export const misfit = async (tx: Reader, { page, ops, checks }: Fitting): Promise<Problem | undefined> => {
  const content = await currentContent(tx, page);
  if (content.kind !== "type") return undefined;
  const { typeId, version, collections } = parsed(TOOL_SCHEMAS.types_get.result, await tx.get(typeVersionKey(content)));
  const declared = new Map(Object.entries(collections));
  return firstMisfit(ops, (collection) => {
    const found = declared.get(collection);
    return found && checks.of({ typeId, version, collection }, found.schema);
  });
};
