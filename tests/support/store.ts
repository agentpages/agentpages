import { type Driver, type FaultPoint, faulty, type Plan, type Viewing } from "@agentpages/conformance";
import { type Answer, type Capability, type Failure, type LogRecord, type Schema, TOOL_SCHEMAS, validate } from "@agentpages/protocol";
import {
  ajvSchemaCompiler,
  createMemoryStorage,
  createStore,
  type Ports,
  type Store,
  type StoreConfig,
  unlimited,
  type Visitor,
} from "@agentpages/server";
import type { Storage, Tx } from "@agentpages/storage";
import { createHmac } from "node:crypto";

export const BASE_URL = "https://pages.test/p/";

/** Small limits, so that a test reaches them quickly. */
export const ADVERTISED: Omit<Capability, "version"> = {
  limits: {
    requestTimeoutMs: 30_000,
    syncIntervalMs: 30_000,
    exportTimeoutMs: 30_000,
    maxHtmlBytes: 400,
    maxSchemaBytes: 200,
    opRetentionSeconds: 3600,
    commitRetentionSeconds: 7200,
    maxThreadEntries: 3,
  },
  state: { maxDocumentBytes: 1024, maxOpsPerCommit: 10, maxTreeDepth: 4, liveChanges: true },
  identity: {},
  files: { maxFileBytes: 1024 },
  render: { maxWidth: 1920, maxHeight: 1080, maxDocumentHeight: 8000, settleTimeoutMs: 1000 },
};

/** The key of every Store of a test that does not choose another. */
export const ACTOR_KEY = "a key of exactly thirty-two bytes";

export interface Seen {
  subject: string;
  /** The page the viewer is on. Nothing when their request names none. */
  pageId?: string;
  /** The key of the Store, when it is not `ACTOR_KEY`. */
  key?: string;
}

/** The id a Store gives a viewer: what the HMAC-SHA-256 of node makes of the page and the subject, as base64url. */
export const viewerId = ({ subject, pageId = "", key = ACTOR_KEY }: Seen): string =>
  createHmac("sha256", key).update(`${pageId}/${subject}`).digest("base64url");

export const START: number = Date.UTC(2026, 0, 1);

/** A Store over real adapters that a test controls: its clock, its ids, its log and where its storage fails. */
export interface World {
  /** The Store as a conformance suite drives it. */
  driver: Driver;
  /** A tool call of any agent. */
  call: Store["call"];
  /** A host operation for any viewer. */
  host: Store["host"];
  /** A method of a view, for any viewer. */
  view: Store["view"];
  sweep: Store["sweep"];
  /** Stops the Store and starts it again over what it saved. */
  restart: () => void;
  /** The tools the Store lists. */
  tools: readonly string[];
  /** Every log record the Store wrote, oldest first. */
  logs: LogRecord[];
  /** The storage as it is on disk, without faults. */
  storage: Storage;
  /** Makes the storage fail the next time it reaches `point`. */
  failAt: (point: FaultPoint) => void;
  /** Replaces what happens at every point of the storage. */
  plan: (plan: Plan) => void;
}

export interface WorldOptions {
  ports?: Partial<Ports>;
  config?: Partial<StoreConfig>;
}

const counter = (): (() => number) => {
  let count = 0;
  return () => {
    count += 1;
    return count;
  };
};

interface State {
  now: number;
  plan: Plan;
}

const calm: Plan = () => "go on";

/** Fails once, the next time the storage reaches `point`. */
const failingOnceAt = (state: State, point: FaultPoint): Plan => (reached) => {
  if (reached !== point) return;
  state.plan = calm;
  throw new Error("The storage crashed.");
};

const portsOf = (state: State, { storage, logs }: Pick<World, "storage" | "logs">): Ports => {
  const next = counter();
  return {
    storage: faulty(storage, (point, touched) => state.plan(point, touched)),
    clock: { now: () => state.now },
    ids: { id: () => `request-${next()}`, secret: () => `secret-${next()}` },
    logger: {
      log: (record) => {
        logs.push(record);
      },
    },
    limiter: unlimited,
    compiler: ajvSchemaCompiler,
  };
};

const principalOf = ({ subject, ...named }: Viewing): Visitor =>
  subject === undefined ? { kind: "anonymous" } : { kind: "viewer", subject, ...named };

/** The Store as the suite sees it: agents by their subject, viewers by the link they hold. */
const driverOf = (running: { store: Store }, advance: (ms: number) => void): Driver => ({
  capability: running.store.capability,
  call: ({ subject, ...request }) => running.store.call({ ...request, principal: { kind: "agent", subject } }),
  host: ({ viewer, ...request }) => running.store.host({ ...request, principal: principalOf(viewer) }),
  view: ({ viewer, ...request }) => running.store.view({ ...request, principal: principalOf(viewer) }),
  advance,
});

export const world = ({ ports = {}, config = {} }: WorldOptions = {}): World => {
  const kept = { storage: createMemoryStorage(), logs: [] };
  const state: State = { now: START, plan: calm };
  const all = { ...portsOf(state, kept), ...ports };
  const start = (): Store => createStore(all, { capability: ADVERTISED, baseUrl: BASE_URL, actorKey: ACTOR_KEY, ...config });
  const running = { store: start() };
  return {
    ...kept,
    tools: running.store.tools,
    call: (request) => running.store.call(request),
    host: (request) => running.store.host(request),
    view: (request) => running.store.view(request),
    sweep: (limit) => running.store.sweep(limit),
    restart: () => {
      running.store = start();
    },
    plan: (plan) => {
      state.plan = plan;
    },
    failAt: (point) => {
      state.plan = failingOnceAt(state, point);
    },
    driver: driverOf(running, (ms) => {
      state.now += ms;
    }),
  };
};

export const ALICE = { kind: "agent", subject: "alice" } as const;

export const BOB = { kind: "agent", subject: "bob" } as const;

export const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** An `opId` that differs from every `pageId` of `uuid`. */
export const op = (n: number): string => uuid(n).replace("4000", "4fff");

export const PAGE: string = uuid(1);

export const HTML = "<!doctype html><title>Page</title>";

export interface Publishing {
  page: number;
  baseVersion: number;
  op: number;
}

export const publishing = ({ page, baseVersion, op: opNumber }: Publishing): Record<string, unknown> => ({
  opId: op(opNumber),
  pageId: uuid(page),
  baseVersion,
  title: "Page",
  content: { kind: "html", html: HTML },
});

export const declaring = (typeId: string, opNumber: number): Record<string, unknown> => ({
  opId: op(opNumber),
  typeId,
  baseVersion: 0,
  title: "Type",
  description: "",
  instructions: "",
  collections: {},
  exports: {},
  content: { html: HTML },
});

/** The failure of an answer. Nothing when the request did not fail. */
export const failureOf = (answer: Answer): Failure | undefined => (answer.kind === "failure" ? answer.failure : undefined);

/** The error an answer failed with. */
export const errorOf = (answer: Answer): string | undefined => failureOf(answer)?.error;

/** The result of a call that must succeed, as the `T` of its schema. */
export const resultOf = <T>(schema: Schema<T>, answer: Answer): T => {
  const checked = validate(schema, answer.kind === "result" ? answer.result : undefined);
  if (!checked.ok) throw new Error(`Expected a result, got ${JSON.stringify(answer)}`);
  return checked.value;
};

/** Every key and value the Store has saved. */
export const saved = (storage: Storage): Promise<unknown> => storage.scan({ prefix: "", limit: Number.MAX_SAFE_INTEGER });

/** `storage`, whose transactions read and write as `changed` says. */
export const transactingAs = (storage: Storage, changed: (tx: Tx) => Partial<Tx>): Storage => ({
  ...storage,
  transact: (locks, run) => storage.transact(locks, (tx) => run({ ...tx, ...changed(tx) })),
});

/** The request that publishes the first version of `PAGE`. */
export const PUBLISHED: [string, unknown] = ["pages_publish", publishing({ page: 1, baseVersion: 0, op: 1 })];

/** A tool call of alice. */
export const call = (target: World, [tool, input]: [string, unknown]): Promise<Answer> =>
  target.call({ tool, input, principal: ALICE });

/** The id the host of `open` chooses for its requests. */
export const HOST_REQUEST = "host-request";

export interface Opening extends Viewing {
  url: string;
}

/** A host that opens `url` for a viewer. */
export const open = (target: World, { url, ...viewer }: Opening): Promise<Answer> =>
  target.host({ operation: "pages_open", input: { url }, principal: principalOf(viewer), requestId: HOST_REQUEST });

export interface Asking extends Opening {
  method: string;
  params: unknown;
}

/** A method of the view that shows `url` to a viewer. */
export const ask = (target: World, { method, params, url, ...viewer }: Asking): Promise<Answer> =>
  target.view({ method, params, url, principal: principalOf(viewer), requestId: HOST_REQUEST });

/** A put of a document of the collection `tasks`. */
export const put = (id: string, data: Record<string, unknown> = {}): Record<string, unknown> => ({ op: "put", collection: "tasks", id, data });

/** The params of a commit of `ops` to the page scope. */
export const committing = (opNumber: number, ops: unknown[]): Record<string, unknown> => ({ scope: "page", opId: op(opNumber), ops });

/** A `state_commit` of alice's to the page scope of `PAGE`. */
export const committed = (opNumber: number, ops: unknown[]): [string, unknown] => ["state_commit", { pageId: PAGE, ...committing(opNumber, ops) }];

export const COMMIT = "agentpages/state/commit";

/** The requests that make `PAGE` a page of the type `deck`, whose first version declares these collections. */
const pageOfType = (collections: object): [string, unknown][] => [
  ["types_publish", { ...declaring("deck", 8), collections }],
  ["pages_publish", { ...publishing({ page: 1, baseVersion: 0, op: 1 }), content: { kind: "type", typeId: "deck", typeVersion: 1 } }],
];

/** `PAGE` as a page of a type that declares tasks of any shape. */
export const TYPED_PAGE: [string, unknown][] = pageOfType({ tasks: { schema: {} } });

/** `PAGE` as a page of a type whose tasks are a tree and whose labels are not. */
export const TREE_PAGE: [string, unknown][] = pageOfType({ tasks: { schema: {}, tree: true }, labels: { schema: {} } });

/** A put of a task under a parent, or as a root. */
export const node = (id: string, parent: string | null): Record<string, unknown> => put(id, { parent, index: "a" });

/** A delete of a task. */
export const remove = (id: string): Record<string, unknown> => ({ op: "delete", collection: "tasks", id });

/** Tool calls of alice, one after the other. */
export const callEach = (target: World, requests: [string, unknown][]): Promise<unknown> =>
  requests.reduce<Promise<unknown>>((earlier, request) => earlier.then(() => call(target, request)), Promise.resolve());

/** What `each` makes of every item, one after the other. */
export const inTurn = <T, R>(items: T[], each: (item: T) => Promise<R>): Promise<R[]> =>
  items.reduce<Promise<R[]>>(async (earlier, item) => [...(await earlier), await each(item)], Promise.resolve([]));

/** A Store with `PAGE` published by alice and shared for writing, and the link of the page. */
export const sharedPage = async (options: WorldOptions = {}): Promise<{ target: World; url: string }> => {
  const target = world(options);
  await call(target, PUBLISHED);
  const shared = await call(target, ["pages_set_access", { opId: op(2), pageId: PAGE, access: "link-write" }]);
  return { target, url: resultOf(TOOL_SCHEMAS.pages_set_access.result, shared).url };
};
