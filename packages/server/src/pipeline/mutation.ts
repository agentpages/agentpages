import type { JsonObject, Schema } from "@agentpages/protocol";
import type { Agent, Principal } from "../access/principal.js";
import type { Key, Tx } from "@agentpages/storage";
import { fingerprint } from "./digest.js";
import { handle } from "./handle.js";
import { segment } from "./keys.js";
import type { Handler, Place, Request, Schemas, Spec, Target } from "./operation.js";
import { ok, type Outcome, refuse } from "./outcome.js";
import { settle } from "./query.js";
import { parsed, recordOf } from "./records.js";

export interface Change<P, T, R, Who extends Principal = Agent> extends Spec<P, T, R, Who> {
  /** The prefix under which the target keeps the requests it remembers. */
  remembers: (params: P, target: T) => Key;
}

const recalled =
  <R>(result: Schema<R>) =>
  (remembered: JsonObject, paramsHash: string): Outcome<R> =>
    remembered.paramsHash === paramsHash
      ? ok(parsed(result, remembered.result))
      : refuse({ error: "InvalidParams", message: "This opId was used before, for a request with other params." });

/** Whose requests a record of an `opId` belongs to. All anonymous viewers are one caller, named after their kind. */
const callerOf = ({ kind, subject }: { kind: string; subject?: string }): string => `${kind}/${segment(subject ?? kind)}`;

/**
 * A request and its `opId` are saved in one transaction. A repeat finds the record and gets the first result again.
 * The record is looked for only once the target exists and the caller has access, and only a success leaves one.
 */
const once =
  <P extends { opId: string }, T, R, Who extends Principal>(schemas: Schemas<P, R>, change: Change<P, T, R, Who>) =>
  (place: Place<P, T, Who>) =>
  async (request: Request<P, Who>, tx: Tx): Promise<Outcome<R>> => {
    const { method, params, principal, at } = request;
    const found = await place.find(request, tx);
    if (!found.ok) return found;
    const key = `${change.remembers(params, found.value)}${callerOf(principal)}/${params.opId}`;
    const paramsHash = await fingerprint([method, params]);
    const remembered = await tx.get(key);
    if (remembered !== undefined) return recalled(schemas.result)(recordOf(remembered), paramsHash);
    const outcome = await settle(change)({ ...request, target: found.value }, tx);
    if (outcome.ok) tx.put(key, { paramsHash, result: outcome.value, at });
    return outcome;
  };

const withOpId =
  <P extends { opId: string }, T, Who extends Principal>(target: Target<P, T, Who>): Target<P, T, Who> =>
  (params, deps) => {
    const place = target(params, deps);
    return place && { ...place, names: { opId: params.opId, ...place.names } };
  };

/** An operation that changes something, and so happens once however often its request arrives. */
export const mutation = <P extends { opId: string }, T, R, Who extends Principal = Agent>(
  schemas: Schemas<P, R>,
  change: Change<P, T, R, Who>,
): Handler<P, R, Who> => ({
  schemas,
  answer: (call) => handle({ schemas, spec: { ...change, target: withOpId(change.target) }, inside: once(schemas, change) }, call),
});
