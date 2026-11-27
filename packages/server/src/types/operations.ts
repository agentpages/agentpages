import type { TypesTools } from "@agentpages/protocol";
import { type Handler } from "../pipeline/index.js";
import type { Agent } from "../access/principal.js";
import { typesGet } from "./get.js";
import { typesList } from "./list.js";
import { typesPublish } from "./publish.js";

export const TYPES_TOOLS: {
  readonly [T in keyof TypesTools]: Handler<TypesTools[T]["params"], TypesTools[T]["result"], Agent>;
} = {
  types_publish: typesPublish,
  types_get: typesGet,
  types_list: typesList,
};
