import type { StateGetParams, StateGetResult } from "@agentpages/protocol";
import type { Principal } from "../access/principal.js";
import { type Handler, ok, parsed, query } from "../pipeline/index.js";
import { documentKey } from "./keys.js";
import { type Arrival, scopeOf, toRead, type Within } from "./scope.js";

export const stateGet = <P extends StateGetParams>(arrival: Arrival<P, StateGetResult>): Handler<P, StateGetResult, Principal> =>
  query<P, Within, StateGetResult>(arrival.schemas, {
    target: scopeOf(arrival, toRead),
    run: async ({ params, target: { scope } }, tx) => {
      const document = (await tx.get(documentKey(scope, params))) ?? null;
      return ok(parsed(arrival.schemas.result, { document }));
    },
  });
