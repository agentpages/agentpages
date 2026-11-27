import type { Actor, Change, Commit, Document, Op, Scope } from "@agentpages/protocol";
import * as fc from "fast-check";
import type { Driver } from "../contract.js";
import { actingAs, agent, type Cases, type Check, inTurn, LINK_WRITE, met, page, pageId, PUBLISH, SET_ACCESS, sharing, tick, timeOf, viewer } from "./kit.js";
import { actorOf, AGENT, COMMIT, COMMITS, STATE_GET, STATE_LIST, type Surface, toolsOf, viewOf } from "./surface.js";

/**
 * Pinned, so that the runs are the same every time. `GENERATED` is the checksum of what this seed makes fast-check
 * generate: another version of fast-check may generate other runs, which need a look at what they still reach.
 */
const SEED = 20_261_127;
const GENERATED = 363_364_080;
const MODULUS = 1_000_000_007;
const RUNS = 20;
const STEPS = 40;
const POOL = 20;
const FINAL_CHECKS = 3;
const MS_PER_STEP = 1000;

const COLLECTIONS = ["tasks", "notes"];
const IDS = ["a", "b", "c", "d"];

type Caller = "agent" | "bob" | "carol";
type LogName = "page" | "bob" | "carol";

/** Who sends a request, in which scope, and the log the two make it reach. */
interface Seat {
  caller: Caller;
  scope: Scope;
  log: LogName;
}

const OWNER: Seat = { caller: "agent", scope: "page", log: "page" };
const BOBS_OWN: Seat = { caller: "bob", scope: "viewer", log: "bob" };
const CAROLS_OWN: Seat = { caller: "carol", scope: "viewer", log: "carol" };
const SEATS: Seat[] = [OWNER, { caller: "bob", scope: "page", log: "page" }, { caller: "carol", scope: "page", log: "page" }, BOBS_OWN, CAROLS_OWN];

/** A commit as it is sent, any number of times: its `opId` is one of a few, so that some are used twice. */
interface Request {
  seat: Seat;
  opId: number;
  ops: Op[];
}

interface Named {
  seat: Seat;
  collection: string;
}

type Step =
  | { kind: "commit"; request: Request }
  | ({ kind: "get"; id: string } & Named)
  | ({ kind: "list"; limit: number } & Named)
  | { kind: "commits"; seat: Seat; since: number; limit: number };

const seat = fc.constantFrom(...SEATS);
const named = { collection: fc.constantFrom(...COLLECTIONS), id: fc.constantFrom(...IDS) };
const limit = fc.constantFrom(1, 2, 2, 100);

/** No condition, that the document does not exist, or a revision that is sometimes its counter and sometimes not. */
const condition = fc.constantFrom<{ ifRevision?: number }[]>({}, {}, {}, {}, {}, { ifRevision: 0 }, { ifRevision: 0 }, { ifRevision: 1 }, { ifRevision: 2 });

const op: fc.Arbitrary<Op> = fc
  .oneof(
    { weight: 3, arbitrary: fc.record({ op: fc.constant<"put">("put"), ...named, data: fc.record({ n: fc.nat({ max: 9 }) }, { noNullPrototype: true }), condition }) },
    { weight: 1, arbitrary: fc.record({ op: fc.constant<"delete">("delete"), ...named, condition }) },
  )
  .map(({ condition: asked, ...change }) => Object.assign(change, asked));

const keyOf = ({ collection, id }: { collection: string; id: string }): string => `${collection}/${id}`;

const request: fc.Arbitrary<Request> = fc.record({ seat, opId: fc.nat({ max: 11 }), ops: fc.uniqueArray(op, { minLength: 1, maxLength: 2, selector: keyOf }) });

const stepOf = (requests: Request[]): fc.Arbitrary<Step> =>
  fc.oneof(
    { weight: 5, arbitrary: fc.record({ kind: fc.constant<"commit">("commit"), request: fc.constantFrom(...requests) }) },
    { weight: 1, arbitrary: fc.record({ kind: fc.constant<"get">("get"), seat, ...named }) },
    { weight: 2, arbitrary: fc.record({ kind: fc.constant<"list">("list"), seat, collection: named.collection, limit }) },
    { weight: 1, arbitrary: fc.record({ kind: fc.constant<"commits">("commits"), seat, since: fc.constantFrom(0, 1, 2, 3, 5, 99), limit }) },
  );

const steps: fc.Arbitrary<Step[]> = fc
  .array(request, { minLength: POOL, maxLength: POOL })
  .chain((requests) => fc.array(stepOf(requests), { minLength: STEPS, maxLength: STEPS }));

/** One scope as the model keeps it: what `list` returns, every counter, and the log. */
interface Log {
  documents: Map<string, Document>;
  revisions: Map<string, number>;
  commits: Commit[];
}

const emptyLog = (): Log => ({ documents: new Map(), revisions: new Map(), commits: [] });

interface Model {
  logs: Record<LogName, Log>;
  /** What each caller's `opId` was first used for, and what it got. */
  remembered: Map<string, { sent: string; answer: unknown }>;
}

const revisionOf = (log: Log, asked: Op): number => log.revisions.get(keyOf(asked)) ?? 0;

const isStale =
  (log: Log) =>
  (asked: Op): boolean => {
    if (asked.ifRevision === undefined) return false;
    return asked.ifRevision === 0 ? log.documents.has(keyOf(asked)) : asked.ifRevision !== revisionOf(log, asked);
  };

interface Stamp {
  at: string;
  by: Actor;
}

const changeOf =
  (log: Log, { at, by }: Stamp) =>
  (asked: Op): Change[] => {
    const counted = { collection: asked.collection, id: asked.id, revision: revisionOf(log, asked) + 1 };
    if (asked.op === "put") return [{ ...counted, document: { ...counted, data: asked.data, updatedAt: at, updatedBy: by } }];
    return log.documents.has(keyOf(asked)) ? [{ ...counted, document: null }] : [];
  };

/** Adds a commit to a log. Replaying the commits of a log into an empty one rebuilds its documents. */
const record = (log: Log, commit: Commit): void => {
  commit.changes.forEach((change) => {
    log.revisions.set(keyOf(change), change.revision);
    if (change.document === null) log.documents.delete(keyOf(change));
    else log.documents.set(keyOf(change), change.document);
  });
  log.commits.push(commit);
};

interface Sent extends Stamp {
  sent: Request;
  opId: string;
}

/** A new commit of the model: a conflict where a condition does not hold, or else the next commit of its log. */
const decided = (model: Model, { sent, opId, ...stamp }: Sent): unknown => {
  const log = model.logs[sent.seat.log];
  const opIndex = sent.ops.findIndex(isStale(log));
  if (opIndex !== -1) return ["Conflict", opIndex];
  const made = { seq: log.commits.length + 1, opId, ...stamp, changes: sent.ops.flatMap(changeOf(log, stamp)) };
  record(log, made);
  return { commit: made };
};

/** What the model answers a commit: the first answer again for a repeat, and nothing remembered of a failure. */
const committed = (model: Model, asked: Sent): unknown => {
  const { seat: asking, opId, ops } = asked.sent;
  const [key, wire] = [`${asking.caller}/${opId}`, JSON.stringify([asking.scope, ops])];
  const known = model.remembered.get(key);
  if (known !== undefined) return known.sent === wire ? known.answer : ["InvalidParams", undefined];
  const answer = decided(model, asked);
  if (!Array.isArray(answer)) model.remembered.set(key, { sent: wire, answer });
  return answer;
};

const isDocument = (found: Document | undefined): found is Document => found !== undefined;

/** The documents of a collection in the order of their ids. */
const documentsIn = (log: Log, collection: string): Document[] => IDS.map((id) => log.documents.get(keyOf({ collection, id }))).filter(isDocument);

const everyDocument = (log: Log): Document[] => COLLECTIONS.flatMap((collection) => documentsIn(log, collection));

/** `items` as `list` pages them: at least one page, and no more than `size` on each. */
const paged = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.max(1, Math.ceil(items.length / size)) }, (_, n) => items.slice(n * size, (n + 1) * size));

interface Stage {
  callers: Record<Caller, { surface: Surface; by: Actor }>;
  model: Model;
  /** The time of the Store's clock. */
  now: number;
  driver: Driver;
}

type Playing<K extends Step["kind"]> = (stage: Stage, step: Extract<Step, { kind: K }>) => Promise<Check>;

const commit: Playing<"commit"> = async (stage, step) => {
  const { surface, by } = stage.callers[step.request.seat.caller];
  const [opId, at] = [pageId(step.request.opId), new Date(stage.now).toISOString()];
  return {
    got: await surface.answers(COMMIT, { scope: step.request.seat.scope, opId, ops: step.request.ops }),
    want: committed(stage.model, { sent: step.request, opId, at, by }),
  };
};

const get: Playing<"get"> = async ({ callers, model }, step) => ({
  got: await callers[step.seat.caller].surface.ok(STATE_GET, { scope: step.seat.scope, collection: step.collection, id: step.id }),
  want: { document: model.logs[step.seat.log].documents.get(keyOf(step)) ?? null },
});

/** Every page of a list, without the cursor that led to the next. */
const pagesOf = async (surface: Surface, params: object): Promise<unknown[]> => {
  const { nextCursor, ...listed } = await surface.ok(STATE_LIST, params);
  return nextCursor === undefined ? [listed] : [listed, ...(await pagesOf(surface, { ...params, cursor: nextCursor }))];
};

const list: Playing<"list"> = async ({ callers, model }, step) => {
  const log = model.logs[step.seat.log];
  const pages = paged(documentsIn(log, step.collection), step.limit);
  return {
    got: await pagesOf(callers[step.seat.caller].surface, { scope: step.seat.scope, collection: step.collection, limit: step.limit }),
    want: pages.map((documents) => ({ documents, seq: log.commits.length })),
  };
};

const commits: Playing<"commits"> = async ({ callers, model }, step) => {
  const { since, limit: most } = step;
  const log = model.logs[step.seat.log];
  return {
    got: await callers[step.seat.caller].surface.answers(COMMITS, { scope: step.seat.scope, since, limit: most }),
    want: since > log.commits.length ? ["InvalidParams", undefined] : { commits: log.commits.slice(since, since + most), seq: log.commits.length },
  };
};

/** Lets a second pass, so that every step has a time of its own, then plays the step against the Store and the model. */
const played = (stage: Stage, step: Step): Promise<Check> => {
  tick(stage.driver);
  stage.now += MS_PER_STEP;
  if (step.kind === "commit") return commit(stage, step);
  if (step.kind === "get") return get(stage, step);
  return step.kind === "list" ? list(stage, step) : commits(stage, step);
};

const replayed = (log: Commit[]): Document[] => {
  const rebuilt = emptyLog();
  log.forEach((made) => {
    record(rebuilt, made);
  });
  return everyDocument(rebuilt);
};

/** A log at the end of a run: its seq is its length, its documents are the model's, and replaying it rebuilds them. */
const settled = async ({ callers, model }: Stage, { caller, scope, log }: Seat): Promise<Check> => {
  const { surface } = callers[caller];
  const followed = await surface.ok(COMMITS, { scope, since: 0 });
  const listed = await Promise.all(COLLECTIONS.map((collection) => surface.ok(STATE_LIST, { scope, collection })));
  const documents = listed.flatMap((each) => each.documents);
  return {
    got: [followed.seq, followed.commits, documents, replayed(followed.commits)],
    want: [model.logs[log].commits.length, model.logs[log].commits, everyDocument(model.logs[log]), documents],
  };
};

/** Page `n` of agent 1, which viewers 2 and 3 hold a link to that lets them write, and a model with nothing in it. */
const staged = async (driver: Driver, n: number): Promise<Stage> => {
  const alice = actingAs(driver, agent(1));
  const published = await alice.ok(PUBLISH, page(n, 0));
  const { url } = await alice.ok(SET_ACCESS, sharing(n, LINK_WRITE));
  const [bob, carol] = [viewer(2, url), viewer(3, url)];
  return {
    driver,
    now: timeOf(published.updatedAt),
    model: { logs: { page: emptyLog(), bob: emptyLog(), carol: emptyLog() }, remembered: new Map() },
    callers: {
      agent: { surface: toolsOf(driver, { by: 1, on: n }), by: AGENT },
      bob: { surface: viewOf(driver, bob), by: await actorOf(driver, bob) },
      carol: { surface: viewOf(driver, carol), by: await actorOf(driver, carol) },
    },
  };
};

/** One run on a page of its own: its steps in turn, then what each of the three logs came to. */
const run =
  (driver: Driver, checks: Check[]) =>
  async ([n, sequence]: [number, Step[]]): Promise<void> => {
    const stage = await staged(driver, n);
    await inTurn(sequence, async (step) => checks.push(await played(stage, step)));
    await inTurn([OWNER, BOBS_OWN, CAROLS_OWN], async (reached) => checks.push(await settled(stage, reached)));
  };

/** A number that changes with any change of the text. */
const checksum = (text: string): number => new TextEncoder().encode(text).reduce((sum, byte) => (sum * 31 + byte) % MODULUS, 7);

export const MODEL_CASES: Cases = {
  "[STATE-10] random commits and reads in the page scope and the scopes of two viewers agree with a model of three logs": async (driver) => {
    const checks: Check[] = [];
    const runs = fc.sample(steps, { seed: SEED, numRuns: RUNS }).map((sequence, index): [number, Step[]] => [index + 1, sequence]);
    await inTurn(runs, run(driver, checks));
    return {
      got: [checksum(JSON.stringify(runs)), checks.length, checks],
      want: [GENERATED, RUNS * (STEPS + FINAL_CHECKS), checks.map(met)],
    };
  },
};
