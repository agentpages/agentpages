import type { JsonObject } from "@agentpages/protocol";
import type { Agent } from "../access/principal.js";
import type { Key, Tx } from "@agentpages/storage";
import { fingerprint } from "./digest.js";
import { handle } from "./handle.js";
import { segment } from "./keys.js";
import type { Handler, Place, Request, Schemas, Spec, Target } from "./operation.js";
import { ok, type Outcome, refuse } from "./outcome.js";
import { settle } from "./query.js";
import { recordOf } from "./records.js";

export interface Change<P, T, R> extends Spec<P, T, R, Agent> {
  /** The prefix under which the target keeps the requests it remembers. */
  remembers: (params: P) => Key;
}

const recalled = (remembered: JsonObject, paramsHash: string): Outcome<unknown> =>
  remembered.paramsHash === paramsHash
    ? ok(remembered.result)
    : refuse({ error: "InvalidParams", message: "This opId was used before, for a request with other params." });

/**
 * A request and its `opId` are saved in one transaction. A repeat finds the record and gets the first result again.
 * The record is looked for only once the target exists and the caller has access, and only a success leaves one.
 */
const once =
  <P extends { opId: string }, T, R>(change: Change<P, T, R>) =>
  (place: Place<P, T, Agent>) =>
  async (request: Request<P, Agent>, tx: Tx): Promise<Outcome<unknown>> => {
    const { method, params, principal, at } = request;
    const found = await place.find(request, tx);
    if (!found.ok) return found;
    const key = `${change.remembers(params)}${segment(principal.subject)}/${params.opId}`;
    const paramsHash = await fingerprint([method, params]);
    const remembered = await tx.get(key);
    if (remembered !== undefined) return recalled(recordOf(remembered), paramsHash);
    const outcome = await settle(change)({ ...request, target: found.value }, tx);
    if (outcome.ok) tx.put(key, { paramsHash, result: outcome.value, at });
    return outcome;
  };

const withOpId =
  <P extends { opId: string }, T>(target: Target<P, T, Agent>): Target<P, T, Agent> =>
  (params, deps) => {
    const place = target(params, deps);
    return place && { ...place, names: { opId: params.opId, ...place.names } };
  };

/** An operation that changes something, and so happens once however often its request arrives. */
export const mutation = <P extends { opId: string }, T, R>(
  schemas: Schemas<P, R>,
  change: Change<P, T, R>,
): Handler<P, R, Agent> => ({
  schemas,
  answer: (call) => handle({ schemas, spec: { ...change, target: withOpId(change.target) }, inside: once(change) }, call),
});
