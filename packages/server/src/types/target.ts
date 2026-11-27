import { type TypeInfo, TypeInfoSchema } from "@agentpages/protocol";
import { ok, type Owned, owned, refuse, type Target } from "../pipeline/index.js";
import type { Agent } from "../access/principal.js";
import type { Value } from "@agentpages/storage";
import { typeKey } from "./keys.js";

interface TypeId {
  typeId: string;
}

export type Type = Owned<TypeInfo>;

const typeOf = (stored: Value): Type => owned(TypeInfoSchema, stored);

/** A type that must exist. Every MCP principal may read it. */
export const existingType =
  <P extends TypeId>(): Target<P, Type> =>
  ({ typeId }) => ({
    names: {},
    locks: [typeKey(typeId)],
    find: async (_, tx) => {
      const stored = await tx.get(typeKey(typeId));
      return stored === undefined
        ? refuse({ error: "NotFound", message: `The type ${typeId} does not exist.` })
        : ok(typeOf(stored));
    },
  });

/** The type of `types_publish`: a new one, or one the caller owns. */
export const publishableType =
  <P extends TypeId>(): Target<P, Type | null, Agent> =>
  ({ typeId }) => ({
    names: {},
    locks: [typeKey(typeId)],
    find: async ({ principal }, tx) => {
      const stored = await tx.get(typeKey(typeId));
      if (stored === undefined) return ok(null);
      const type = typeOf(stored);
      return type.owner === principal.subject
        ? ok(type)
        : refuse({ error: "Forbidden", message: `Only its owner can publish a version of the type ${typeId}.` });
    },
  });
