import {
  type Actor,
  type Answer,
  type Commit,
  type Document,
  type IdentityGetResult,
  type JsonObject,
  METHOD_SCHEMAS,
  type Op,
  type PageContent,
  type Schema,
  type StateCommitResult,
  type StateCommitsResult,
  type StateGetResult,
  type StateLimits,
  type StateListResult,
} from "@agentpages/protocol";
import type { Driver } from "../contract.js";
import {
  actingAs,
  agent,
  type Cases,
  type Check,
  errorIn,
  having,
  HOST_REQUEST,
  html,
  LINK_WRITE,
  type Loose,
  met,
  opId,
  page,
  pageId,
  PUBLISH,
  resultIn,
  type Session,
  SET_ACCESS,
  sharing,
  type,
  TYPE_PUBLISH,
  typed,
  viewer,
  type Visit,
} from "./kit.js";

/** An operation of a feature: the name of its view method after `agentpages/`, and the schema of its result. */
export interface StateOp<R> {
  name: string;
  result: Schema<R>;
}

/** The operation behind a view method, such as `state/get`. */
export const opOf = <R>(name: string, { result }: { result: Schema<R> }): StateOp<R> => ({ name, result });

export const STATE_GET: StateOp<StateGetResult> = opOf("state/get", METHOD_SCHEMAS["agentpages/state/get"]);
export const STATE_LIST: StateOp<StateListResult> = opOf("state/list", METHOD_SCHEMAS["agentpages/state/list"]);
export const COMMIT: StateOp<StateCommitResult> = opOf("state/commit", METHOD_SCHEMAS["agentpages/state/commit"]);
export const COMMITS: StateOp<StateCommitsResult> = opOf("state/commits", METHOD_SCHEMAS["agentpages/state/commits"]);

/** One way to the state and the files of a page: the tools of an agent, or the methods of a view. */
export interface Surface {
  /** The result of a state request. */
  ok: <R>(op: StateOp<R>, params: unknown) => Promise<R>;
  /** The error of a state request. */
  fails: (op: StateOp<unknown>, params: unknown) => Promise<string>;
  /** The result of a state request, or its error with the position of the op it blames. */
  answers: (op: StateOp<unknown>, params: unknown) => Promise<unknown>;
  /** The error of a state request, or `done` when it has none. */
  outcome: (op: StateOp<unknown>, params: unknown) => Promise<string>;
}

const DONE = "done";

const answeredIn = (answer: Answer): unknown => {
  const { failure, result }: Loose = answer;
  return failure === undefined ? result : [failure.error, failure.opIndex];
};

const outcomeIn = (answer: Answer): string => {
  const { failure }: Loose = answer;
  return failure === undefined ? DONE : failure.error;
};

type Ask = (op: StateOp<unknown>, params: unknown) => Promise<Answer>;

/** A surface that sends each request as `ask` does. */
export const surfaceOf = (ask: Ask): Surface => ({
  ok: async (op, params) => resultIn(op.result, await ask(op, params)),
  fails: async (op, params) => errorIn(await ask(op, params)),
  answers: async (op, params) => answeredIn(await ask(op, params)),
  outcome: async (op, params) => outcomeIn(await ask(op, params)),
});

/** The tools of agent `by`, on page `on`. Section 5.3 of the spec names a tool after its method. */
export const toolsOf = (driver: Driver, { by, on }: { by: number; on: number }): Surface =>
  surfaceOf(({ name }, params) => driver.call({ tool: name.replace("/", "_"), input: Object.assign({}, params, { pageId: pageId(on) }), subject: agent(by) }));

/** A method of the view that shows the page behind the link of `visit`. The link is no part of the params. */
export const asking = (driver: Driver, { url, ...shown }: Visit) => (method: string, params: unknown): Promise<Answer> =>
  driver.view({ method, params, viewer: shown, url, requestId: HOST_REQUEST });

/** The methods of the view a viewer has open. */
export const viewOf = (driver: Driver, visit: Visit): Surface =>
  surfaceOf(({ name }, params) => asking(driver, visit)(`agentpages/${name}`, params));

const IDENTITY_GET = "agentpages/identity/get";

/** What `identity/get` answers a viewer. */
export const identityOf = async (driver: Driver, visit: Visit): Promise<IdentityGetResult> =>
  resultIn(METHOD_SCHEMAS[IDENTITY_GET].result, await asking(driver, visit)(IDENTITY_GET, {}));

export const identityFails = async (driver: Driver, visit: Visit): Promise<string> =>
  errorIn(await asking(driver, visit)(IDENTITY_GET, {}));

export const AGENT: Actor = { kind: "agent" };

/** A commit of a signed-in viewer that changes nothing, in their own scope. It needs no more than read access. */
export const ownCommit = async (driver: Driver, visit: Visit): Promise<Commit> =>
  (await viewOf(driver, visit).ok(COMMIT, mine(committing([])))).commit;

/** Who the Store says a signed-in viewer is when they change something: who made a commit in their own scope. */
export const actorOf = async (driver: Driver, visit: Visit): Promise<Actor> => (await ownCommit(driver, visit)).by;

export const limitsOf = (driver: Driver): StateLimits => Object.assign({}, driver.capability.state);

const TASKS = "tasks";

export const put = (id: string, data: JsonObject): Op => ({ op: "put", collection: TASKS, id, data });

export const remove = (id: string): Op => ({ op: "delete", collection: TASKS, id });

export const onlyIf = (op: Op, ifRevision: number): Op => ({ ...op, ifRevision });

/** `named`, which names a document, in another collection. */
export const within = <N extends { collection: string }>(collection: string, named: N): N => ({ ...named, collection });

/** The params that commit `ops` to the page scope, under an `opId` of their own. */
export const committing = (ops: readonly unknown[]): { scope: string; opId: string; ops: readonly unknown[] } => ({ scope: "page", opId: opId(), ops });

/** The params that read one document of the page scope. */
export const doc = (id: string): { scope: string; collection: string; id: string } => ({ scope: "page", collection: TASKS, id });

/** The params that list the documents of the page scope. */
export const listing = (): { scope: string; collection: string } => ({ scope: "page", collection: TASKS });

/** The params that follow the log of the page scope. */
export const after = (since: number): { scope: string; since: number } => ({ scope: "page", since });

/** `params`, for the viewer's own scope. */
export const mine = <P extends object>(params: P): P & { scope: string } => ({ ...params, scope: "viewer" });

/** A document as the commit that put it left it. */
export const stored = ({ at, by }: Commit, { id, data, revision }: Pick<Document, "id" | "data" | "revision">): Document => ({
  collection: TASKS,
  id,
  data,
  revision,
  updatedAt: at,
  updatedBy: by,
});

export interface Shared {
  alice: Session;
  url: string;
}

/** Agent 1, with page 1 published and shared with this access. */
export const shared = async (driver: Driver, access: string): Promise<Shared> => {
  const alice = actingAs(driver, agent(1));
  await alice.ok(PUBLISH, page(1, 0));
  return { alice, url: (await alice.ok(SET_ACCESS, sharing(1, access))).url };
};

/** The seq a commit of these ops gets. */
export const seqOf = async (surface: Surface, ops: readonly unknown[]): Promise<number> => (await surface.ok(COMMIT, committing(ops))).commit.seq;

/** The revision each change of a commit of these ops brings. */
export const revisionsOf = async (surface: Surface, ops: readonly unknown[]): Promise<number[]> =>
  (await surface.ok(COMMIT, committing(ops))).commit.changes.map((change) => change.revision);

/** The seqs of the commits a request for commits returns. */
export const seqsAfter = async (surface: Surface, params: unknown): Promise<number[]> =>
  (await surface.ok(COMMITS, params)).commits.map((commit) => commit.seq);

/** A surface, with who the Store says acts through it, and the number of its page. */
export interface Acting extends Surface {
  by: Actor;
  page: number;
}

/** Publishes a second version of the type of the page, which declares these collections, and moves the page to it. */
export const retyped = async (driver: Driver, { page: n, collections }: { page: number; collections: object }): Promise<void> => {
  const alice = actingAs(driver, agent(1));
  await alice.ok(TYPE_PUBLISH, having(type(n, 1), ["collections", collections]));
  await alice.ok(PUBLISH, having(page(n, 1), ["content", typed(n, 2)]));
};

export type ActingCases = Record<string, (acting: Acting, driver: Driver) => Promise<Check>>;

/** Publishes whatever page `n` needs first, such as its type, and returns the content of the page. */
export type Prepare = (alice: Session, n: number) => Promise<PageContent>;

const plain: Prepare = (_, n) => Promise.resolve(html(n));

/** Page 1 through the tools of its owner, and page 2 through the view of a link holder who may write, with that holder. */
export const twoSides = async (driver: Driver, prepare: Prepare = plain): Promise<[Surface, Surface, Visit]> => {
  const alice = actingAs(driver, agent(1));
  await alice.ok(PUBLISH, having(page(1, 0), ["content", await prepare(alice, 1)]));
  await alice.ok(PUBLISH, having(page(2, 0), ["content", await prepare(alice, 2)]));
  const holder = viewer(2, (await alice.ok(SET_ACCESS, sharing(2, LINK_WRITE))).url);
  return [toolsOf(driver, { by: 1, on: 1 }), viewOf(driver, holder), holder];
};

const both = async (driver: Driver, prepare: Prepare): Promise<[Acting, Acting]> => {
  const [tools, view, holder] = await twoSides(driver, prepare);
  return [
    { ...tools, by: AGENT, page: 1 },
    { ...view, by: await actorOf(driver, holder), page: 2 },
  ];
};

/** Each case as one that runs twice in one Store: on the first of what `stage` sets up, then on the second. */
export const onEach = <A>(cases: Record<string, (acting: A, driver: Driver) => Promise<Check>>, stage: (driver: Driver) => Promise<[A, A]>): Cases =>
  Object.fromEntries(
    Object.entries(cases).map(([title, run]) => [
      title,
      async (driver: Driver): Promise<Check> => {
        const [tools, view] = await stage(driver);
        const first = await run(tools, driver);
        const second = await run(view, driver);
        return { got: [first, second], want: [met(first), met(second)] };
      },
    ]),
  );

/** Each case as one that runs twice in one Store: through the tools, then through a view. */
export const onBoth = (cases: ActingCases, prepare: Prepare = plain): Cases => onEach(cases, (driver) => both(driver, prepare));
