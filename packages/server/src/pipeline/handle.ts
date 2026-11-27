import { failure, invalidParams, type Validation, validate } from "@agentpages/protocol";
import { actorOf } from "../access/actor.js";
import type { Principal } from "../access/principal.js";
import type { Tx } from "../ports/storage.js";
import type { Settled } from "./answer.js";
import type { Call, Place, Request, Schemas, Spec } from "./operation.js";
import type { Outcome, Refusal } from "./outcome.js";
import { transact } from "./transaction.js";

export interface Operation<P, T, R, Who extends Principal> {
  schemas: Schemas<P, R>;
  spec: Spec<P, T, R, Who>;
  /** Everything that happens in the transaction, from finding the target on. */
  inside: (place: Place<P, T, Who>) => (request: Request<P, Who>, tx: Tx) => Promise<Outcome<unknown>>;
}

interface Attempt<P, T, R, Who extends Principal> {
  operation: Operation<P, T, R, Who>;
  call: Call<Who>;
  requestId: string;
  at: string;
  checked: Validation<P>;
  place: Place<P, T, Who> | undefined;
}

interface Decided {
  answer: Settled;
  cause: { cause?: string };
}

const failed = (requestId: string, refusal: Refusal): Settled => ({
  kind: "failure",
  failure: failure({ ...refusal, requestId }),
});

const settled = (requestId: string, outcome: Outcome<unknown>): Settled =>
  outcome.ok ? { kind: "result", result: outcome.value } : failed(requestId, outcome.refusal);

const unavailable = (): Outcome<never> => ({
  ok: false,
  refusal: { error: "Unavailable", message: "The storage did not answer. Repeat the request with the same opId." },
});

const nowhere = (): Refusal => ({ error: "NotFound", message: "The request names no page of this Store." });

const rateLimited = (requestId: string, retryAfterMs: number): Settled => ({
  kind: "failure",
  failure: failure({ error: "RateLimited", requestId, message: `Too many requests. Wait ${retryAfterMs} ms.`, retryAfterMs }),
});

/** The checks of a request in the order the spec gives them. The first that fails decides the answer. */
const decide = async <P, T, R, Who extends Principal>(attempt: Attempt<P, T, R, Who>): Promise<Settled> => {
  const { operation, call, requestId, at, checked, place } = attempt;
  const { deps, method, principal } = call;
  const limited = deps.limiter.check({ principal, method, pageId: place?.names.pageId });
  if (limited !== undefined) return rateLimited(requestId, limited.retryAfterMs);
  if (!checked.ok) return { kind: "failure", failure: invalidParams({ requestId, issues: checked.issues }) };
  const malformed = operation.spec.malformed?.(checked.value, deps);
  if (malformed !== undefined) return failed(requestId, malformed);
  if (place === undefined) return failed(requestId, nowhere());
  const request = { deps, method, principal, requestId, at, params: checked.value };
  const run = (tx: Tx): Promise<Outcome<unknown>> => operation.inside(place)(request, tx);
  return settled(requestId, (await transact({ storage: deps.storage, locks: place.locks, run })) ?? unavailable());
};

const causeOf = (error: unknown): string => (error instanceof Error ? error.name : typeof error);

const crashed =
  (requestId: string) =>
  (error: unknown): Decided => ({
    answer: failed(requestId, { error: "Internal", message: "The Store failed. Its log has the cause." }),
    cause: { cause: causeOf(error) },
  });

const verdictOf = (answer: Settled): { outcome: "ok" } | { outcome: "error"; error: string } =>
  answer.kind === "failure" ? { outcome: "error", error: answer.failure.error } : { outcome: "ok" };

/** Answers one request and writes its one log record. */
export const handle = async <P, T, R, Who extends Principal>(
  operation: Operation<P, T, R, Who>,
  call: Call<Who>,
): Promise<Settled> => {
  const { clock, ids, logger } = call.deps;
  const started = clock.now();
  const at = new Date(started).toISOString();
  const requestId = ids.id();
  const checked = validate(operation.schemas.params, call.input);
  const place = checked.ok ? operation.spec.target(checked.value, call.deps) : undefined;
  const attempt = { operation, call, requestId, at, checked, place };
  const { answer, cause } = await decide(attempt).then((decided): Decided => ({ answer: decided, cause: {} }), crashed(requestId));
  logger.log({
    at,
    requestId,
    ...place?.names,
    actor: await actorOf(call.principal),
    method: call.method,
    ...verdictOf(answer),
    ...cause,
    durationMs: clock.now() - started,
  });
  return answer;
};
