import { failure, ID_PATTERN, invalidParams, type LogRecord, type Settled, type Validation, validate } from "@agentpages/protocol";
import type { Tx } from "@agentpages/storage";
import { actorOf } from "../access/actor.js";
import type { Principal } from "../access/principal.js";
import type { Logger } from "../ports/logger.js";
import type { Call, Place, Request, Schemas, Spec } from "./operation.js";
import type { Outcome, Refusal } from "./outcome.js";
import { transact } from "./transaction.js";

export interface Operation<P, T, R, Who extends Principal> {
  schemas: Schemas<P, R>;
  spec: Spec<P, T, R, Who>;
  /** Everything that happens in the transaction, from finding the target on. */
  inside: (place: Place<P, T, Who>) => (request: Request<P, Who>, tx: Tx) => Promise<Outcome<R>>;
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
  /** What the log record says beside the outcome. */
  noted: Pick<LogRecord, "seq" | "cause">;
}

const plain = (answer: Settled): Decided => ({ answer, noted: {} });

const failed = (requestId: string, refusal: Refusal): Settled => ({
  kind: "failure",
  failure: failure({ ...refusal, requestId }),
});

const settled = (requestId: string, outcome: Outcome<unknown>): Settled =>
  outcome.ok ? { kind: "result", result: outcome.value } : failed(requestId, outcome.refusal);

const STORAGE_DOWN: Outcome<never> = {
  ok: false,
  refusal: { error: "Unavailable", message: "The storage did not answer. Repeat the request with the same opId." },
};

const LIMITER_DOWN: Refusal = {
  error: "Unavailable",
  message: "The rate limiter did not answer. Repeat the request with the same opId.",
};

const nowhere = (): Refusal => ({ error: "NotFound", message: "The request names no page of this Store." });

const rateLimited = (requestId: string, retryAfterMs: number): Settled => ({
  kind: "failure",
  failure: failure({ error: "RateLimited", requestId, message: `Too many requests. Wait ${retryAfterMs} ms.`, retryAfterMs }),
});

const none = (): undefined => {};

/** What a request that succeeded created, for its log record. */
const createdBy = <P, T, R, Who extends Principal>(spec: Spec<P, T, R, Who>, outcome: Outcome<R>): { seq?: number } =>
  outcome.ok ? { ...spec.created?.(outcome.value) } : {};

/** Half of a surrogate pair: text that is not well-formed Unicode, and so cannot be part of a key. */
const LONE_SURROGATE = /\p{Surrogate}/u;

/** What is wrong with what the transport passed beside the input: who makes the request, and the id it goes by. */
const strayEnvelope = ({ principal, requestId }: Call<Principal>): Refusal | undefined => {
  if (Object.values(principal).some((text) => LONE_SURROGATE.test(text))) {
    return { error: "InvalidParams", message: "principal: Expected well-formed Unicode." };
  }
  return ID_PATTERN.test(requestId) ? undefined : { error: "InvalidParams", message: "requestId: Expected an id." };
};

/** What the rate limiter makes of a request. Nothing when the request may go on. */
const held = async <P, T, R, Who extends Principal>(attempt: Attempt<P, T, R, Who>): Promise<Settled | undefined> => {
  const { call, requestId, place } = attempt;
  const { deps, method, principal } = call;
  const asked = await deps.limiter.check({ principal, method, pageId: place?.names.pageId }).then((limited) => ({ limited }), none);
  if (asked === undefined) return failed(requestId, LIMITER_DOWN);
  return asked.limited && rateLimited(requestId, asked.limited.retryAfterMs);
};

/** What stops a request before its params are looked at. */
const turnedAway = <P, T, R, Who extends Principal>(attempt: Attempt<P, T, R, Who>): Promise<Settled | undefined> => {
  const stray = strayEnvelope(attempt.call);
  return stray === undefined ? held(attempt) : Promise.resolve(failed(attempt.requestId, stray));
};

/** The checks of a request in the order the spec gives them. The first that fails decides the answer. */
const decide = async <P, T, R, Who extends Principal>(attempt: Attempt<P, T, R, Who>): Promise<Decided> => {
  const { operation, call, requestId, at, checked, place } = attempt;
  const { deps, method, principal } = call;
  const turned = await turnedAway(attempt);
  if (turned !== undefined) return plain(turned);
  if (!checked.ok) return plain({ kind: "failure", failure: invalidParams({ requestId, issues: checked.issues }) });
  const malformed = operation.spec.malformed?.(checked.value, deps);
  if (malformed !== undefined) return plain(failed(requestId, malformed));
  if (place === undefined) return plain(failed(requestId, nowhere()));
  const request = { deps, method, principal, requestId, at, params: checked.value };
  const run = (tx: Tx): Promise<Outcome<R>> => operation.inside(place)(request, tx);
  const outcome = (await transact({ storage: deps.storage, locks: place.locks, run })) ?? STORAGE_DOWN;
  return { answer: settled(requestId, outcome), noted: createdBy(operation.spec, outcome) };
};

const causeOf = (error: unknown): string => (error instanceof Error ? error.name : typeof error);

const crashed =
  (requestId: string) =>
  (error: unknown): Decided => ({
    answer: failed(requestId, { error: "Internal", message: "The Store failed. Its log has the cause." }),
    noted: { cause: causeOf(error) },
  });

const verdictOf = (answer: Settled): { outcome: "ok" } | { outcome: "error"; error: string } =>
  answer.kind === "failure" ? { outcome: "error", error: answer.failure.error } : { outcome: "ok" };

/** Section 7.7 of the spec: a log record that cannot be written is lost, and the answer stays what it was. */
const written = (logger: Logger, record: LogRecord): Promise<unknown> =>
  Promise.resolve(record)
    .then((whole) => {
      logger.log(whole);
      return whole;
    })
    .catch(none);

/** Answers one request and writes its one log record. An id its host chose badly is replaced, and the request refused. */
export const handle = async <P, T, R, Who extends Principal>(
  operation: Operation<P, T, R, Who>,
  call: Call<Who>,
): Promise<Settled> => {
  const { clock, ids, logger } = call.deps;
  const started = clock.now();
  const at = new Date(started).toISOString();
  const requestId = ID_PATTERN.test(call.requestId) ? call.requestId : ids.id();
  const checked = validate(operation.schemas.params, call.input);
  const place = checked.ok ? operation.spec.target(checked.value, call.deps) : undefined;
  const attempt = { operation, call, requestId, at, checked, place };
  const { answer, noted } = await decide(attempt).catch(crashed(requestId));
  await written(logger, {
    at,
    requestId,
    ...place?.names,
    actor: await actorOf(call.principal),
    method: call.method,
    ...verdictOf(answer),
    ...noted,
    durationMs: clock.now() - started,
  });
  return answer;
};
