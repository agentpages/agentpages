import { type Driver, type FaultPoint, faulty, type Plan, type Reply, type Viewing } from "@agentpages/conformance";
import { type Capability, type LogRecord, type Schema, validate } from "@agentpages/protocol";
import {
  ajvSchemaCompiler,
  createMemoryStorage,
  createStore,
  type Ports,
  type Storage,
  type Store,
  type StoreConfig,
  unlimited,
  type Visitor,
} from "@agentpages/server";

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
  },
  state: { maxDocumentBytes: 1024, maxOpsPerCommit: 10, liveChanges: true },
  identity: {},
  files: { maxFileBytes: 1024 },
  render: { maxWidth: 1920, maxHeight: 1080, maxDocumentHeight: 8000, settleTimeoutMs: 1000 },
};

export const START: number = Date.UTC(2026, 0, 1);

/** A Store over real adapters that a test controls: its clock, its ids, its log and where its storage fails. */
export interface World {
  /** The Store as a conformance suite drives it. */
  driver: Driver;
  /** A tool call of any agent. */
  call: Store["call"];
  /** A host operation for any viewer. */
  host: Store["host"];
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
    storage: faulty(storage, (point) => state.plan(point)),
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

const principalOf = ({ url, subject }: Viewing): Visitor =>
  subject === undefined ? { kind: "anonymous", url } : { kind: "viewer", subject, url };

/** The Store as the suite sees it: agents by their subject, viewers by the link they hold. */
const driverOf = (running: { store: Store }, advance: (ms: number) => void): Driver => ({
  capability: running.store.capability,
  call: ({ subject, ...request }) => running.store.call({ ...request, principal: { kind: "agent", subject } }),
  host: ({ viewer, ...request }) => running.store.host({ ...request, principal: principalOf(viewer) }),
  advance,
});

export const world = ({ ports = {}, config = {} }: WorldOptions = {}): World => {
  const kept = { storage: createMemoryStorage(), logs: [] };
  const state: State = { now: START, plan: calm };
  const all = { ...portsOf(state, kept), ...ports };
  const start = (): Store => createStore(all, { capability: ADVERTISED, baseUrl: BASE_URL, ...config });
  const running = { store: start() };
  return {
    ...kept,
    tools: running.store.tools,
    call: (request) => running.store.call(request),
    host: (request) => running.store.host(request),
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

/** The result of a call that must succeed, as the `T` of its schema. */
export const resultOf = <T>(schema: Schema<T>, answer: Reply): T => {
  const checked = validate(schema, answer.result);
  if (answer.kind !== "result" || !checked.ok) throw new Error(`Expected a result, got ${JSON.stringify(answer)}`);
  return checked.value;
};

/** Every key and value the Store has saved. */
export const saved = (storage: Storage): Promise<unknown> => storage.scan({ prefix: "", limit: Number.MAX_SAFE_INTEGER });

/** The request that publishes the first version of `PAGE`. */
export const PUBLISHED: [string, unknown] = ["pages_publish", publishing({ page: 1, baseVersion: 0, op: 1 })];

/** A tool call of alice. */
export const call = (target: World, [tool, input]: [string, unknown]): Promise<Reply> =>
  target.call({ tool, input, principal: ALICE });

interface Registered {
  name: string;
  suite?: { tasks: { name: string }[] };
}

/** The titles of the tests registered beside `task`. */
export const titlesBeside = (task: Registered): string[] | undefined =>
  task.suite?.tasks.map((registered) => registered.name).filter((title) => title !== task.name);
