import type { ExchangeSchemas, Schema } from "../common/schemas.js";
import { FILES_METHOD_SCHEMAS } from "../files/schemas.js";
import { IDENTITY_METHOD_SCHEMAS } from "../identity/schemas.js";
import { STATE_METHOD_SCHEMAS, StateCommittedParamsSchema } from "../state/schemas.js";
import { VIEW_METHOD_SCHEMAS } from "../view/schemas.js";
import type { Methods, NotificationName, Notifications } from "./methods.js";

export const METHOD_SCHEMAS: ExchangeSchemas<Methods> = {
  ...STATE_METHOD_SCHEMAS,
  ...IDENTITY_METHOD_SCHEMAS,
  ...FILES_METHOD_SCHEMAS,
  ...VIEW_METHOD_SCHEMAS,
};

export const NOTIFICATION_SCHEMAS: {
  readonly [N in NotificationName]: { readonly params: Schema<Notifications[N]["params"]> };
} = {
  "agentpages/state/committed": { params: StateCommittedParamsSchema },
};
