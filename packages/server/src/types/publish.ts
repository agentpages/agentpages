import {
  htmlProblem,
  type Problem,
  schemaProblem,
  TOOL_SCHEMAS,
  type TypeInfo,
  TypeInfoSchema,
  type TypesPublishParams,
} from "@agentpages/protocol";
import { type Context, type Deps, type Handler, mutation, ok, type Outcome, parsed, refuse } from "../pipeline/index.js";
import type { Agent } from "../access/principal.js";
import type { Tx } from "@agentpages/storage";
import { declaredKey, rememberedPrefix, typeKey, typeVersionKey } from "./keys.js";
import { publishableType, type Type } from "./target.js";

type Publishing = Context<TypesPublishParams, Type | null, Agent>;

type Collections = TypeInfo["collections"];

/** Section 6 of the spec: a schema that is not valid JSON Schema 2020-12, or refers to anything outside itself. */
const invalidSchema = ({ collections }: TypesPublishParams, { compiler }: Deps): Problem | undefined =>
  Object.entries(collections)
    .map(([name, { schema }]) => {
      const compiled = compiler.compile(schema);
      return "error" in compiled
        ? { error: compiled.error, message: `collections.${name}.schema: ${compiled.message}` }
        : undefined;
    })
    .find(Boolean);

/** Every collection a version of the type ever declared. */
const declaredBy = async ({ params, target }: Publishing, tx: Tx): Promise<Collections> =>
  target === null ? {} : parsed(TypeInfoSchema, await tx.get(declaredKey(params.typeId))).collections;

/** A collection is a tree in every version of a type or in none. */
const treeChange = (declared: Collections, published: Collections): string | undefined =>
  Object.entries(declared)
    .filter(([name, was]) => {
      const collection = published[name];
      return collection !== undefined && collection.tree !== was.tree;
    })
    .map(([name]) => name)
    .at(0);

const refusal = ({ params, target }: Publishing, declared: Collections): Outcome<never> | undefined => {
  const current = target?.info.version ?? 0;
  const changed = treeChange(declared, params.collections);
  if (params.baseVersion !== current) {
    const message = `baseVersion ${params.baseVersion} is not the current version ${current}.`;
    return refuse({ error: "Conflict", message });
  }
  return changed === undefined
    ? undefined
    : refuse({ error: "InvalidParams", message: `The collection ${changed} cannot stop or start being a tree.` });
};

const publish = async (context: Publishing, tx: Tx): Promise<Outcome<TypeInfo>> => {
  const { params, principal, at } = context;
  const declared = await declaredBy(context, tx);
  const refused = refusal(context, declared);
  if (refused !== undefined) return refused;
  const published = { ...params, version: params.baseVersion + 1, updatedAt: at };
  const info = parsed(TypeInfoSchema, published);
  tx.put(typeVersionKey({ typeId: info.typeId, typeVersion: info.version }), published);
  tx.put(declaredKey(info.typeId), { ...info, collections: { ...declared, ...info.collections } });
  tx.put(typeKey(info.typeId), { ...info, owner: principal.subject });
  return ok(info);
};

export const typesPublish: Handler<TypesPublishParams, TypeInfo, Agent> = mutation(TOOL_SCHEMAS.types_publish, {
  target: publishableType(),
  remembers: ({ typeId }) => rememberedPrefix(typeId),
  malformed: invalidSchema,
  limits: ({ collections, content }, { limits }) =>
    htmlProblem({ html: content.html, limits }) ??
    Object.values(collections)
      .map(({ schema }) => schemaProblem({ schema, limits }))
      .find(Boolean),
  run: publish,
});
