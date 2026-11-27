import type { Agent, Principal } from "../access/principal.js";
import type { Key, Tx } from "@agentpages/storage";
import { fingerprint } from "./digest.js";
import { handle } from "./handle.js";
import { keep } from "./kept.js";
import { segment } from "./keys.js";
import type { Context, Handler, Place, Request, Schemas, Spec, Target } from "./operation.js";
import { ok, type Outcome, refuse } from "./outcome.js";
import { settle } from "./query.js";
import { parsed, recordOf } from "./records.js";

/** Where a page or type keeps the requests it remembers. */
export interface Remembered {
  /** What the key of every such request starts with. */
  prefix: Key;
  /** The lock of the page or type. */
  lock: Key;
}

/** A repeat of a request, with what the record of the request kept. */
interface First<P, T, Who extends Principal> {
  kept: Record<string, unknown>;
  context: Context<P, T, Who>;
}

/** What a change keeps of its first result, and how a repeat gets that result again. */
export interface Memory<P, T, R, Who extends Principal = Agent> {
  /** What the record of the request holds beside its params and its time. */
  kept: (result: R) => Record<string, unknown>;
  /** The first result, from what was kept and from what the Store holds now. */
  recalled: (tx: Tx, first: First<P, T, Who>) => Promise<R>;
}

export interface Change<P, T, R, Who extends Principal = Agent> extends Spec<P, T, R, Who> {
  remembers: (params: P, target: T) => Remembered;
  /** Without it the record holds the whole result. A change whose results grow with what it changes keeps less. */
  memory?: Memory<P, T, R, Who>;
}

interface Remembering {
  key: Key;
  lock: Key;
  record: Record<string, unknown> & { paramsHash: string; at: string };
}

const whole = <P, T, R, Who extends Principal>({ result }: Schemas<P, R>): Memory<P, T, R, Who> => ({
  kept: (first) => ({ result: first }),
  recalled: (_, { kept }) => Promise.resolve(parsed(result, kept.result)),
});

/** Saves the record of a request, with a note of when. */
const remember = (tx: Tx, { key, lock, record }: Remembering): void => {
  tx.put(key, record);
  keep(tx, { kind: "op", at: record.at, row: key, lock });
};

const reused = (): Promise<Outcome<never>> =>
  Promise.resolve(refuse({ error: "InvalidParams", message: "This opId was used before, for a request with other params." }));

/** Whose requests a record of an `opId` belongs to. All anonymous viewers are one caller, named after their kind. */
const callerOf = ({ kind, subject }: { kind: string; subject?: string }): string => `${kind}/${segment(subject ?? kind)}`;

/**
 * A request and its `opId` are saved in one transaction, and only a success is saved. The record is looked for once
 * the target exists and the caller has access. A repeat with the same params gets the first result again, before the
 * limits, as the memory of the change recalls it. An `opId` that was used for other params is refused after them.
 */
const once =
  <P extends { opId: string }, T, R, Who extends Principal>(schemas: Schemas<P, R>, change: Change<P, T, R, Who>) =>
  (place: Place<P, T, Who>) =>
  async (request: Request<P, Who>, tx: Tx): Promise<Outcome<R>> => {
    const { method, params, principal, at } = request;
    const found = await place.find(request, tx);
    if (!found.ok) return found;
    const context = { ...request, target: found.value };
    const memory = change.memory ?? whole(schemas);
    const { prefix, lock } = change.remembers(params, found.value);
    const key = `${prefix}${callerOf(principal)}/${params.opId}`;
    const paramsHash = await fingerprint([method, params]);
    const stored = await tx.get(key);
    const first = stored && recordOf(stored);
    if (first?.paramsHash === paramsHash) return ok(await memory.recalled(tx, { kept: first, context }));
    const run = first === undefined ? change.run : reused;
    const outcome = await settle({ ...change, run })(context, tx);
    if (outcome.ok) remember(tx, { key, lock, record: { ...memory.kept(outcome.value), paramsHash, at } });
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
