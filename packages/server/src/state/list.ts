import type { StateListParams, StateListResult } from "@agentpages/protocol";
import type { Principal } from "../access/principal.js";
import { type Handler, list, ok, parsed, query } from "../pipeline/index.js";
import { documentsPrefix } from "./keys.js";
import { seqOf } from "./records.js";
import { type Arrival, scopeOf, toRead, type Within } from "./scope.js";

export const stateList = <P extends StateListParams>(arrival: Arrival<P, StateListResult>): Handler<P, StateListResult, Principal> =>
  query<P, Within, StateListResult>(arrival.schemas, {
    target: scopeOf(arrival, toRead),
    run: async ({ params, target: { scope } }, tx) => {
      const { rows, next } = await list({ tx, prefix: documentsPrefix(scope, params.collection), paging: params });
      const documents = rows.map(([, stored]) => stored);
      return ok(parsed(arrival.schemas.result, { documents, seq: await seqOf(tx, scope), ...next }));
    },
  });
