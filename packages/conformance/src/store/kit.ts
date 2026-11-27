import {
  type Empty,
  type ErrorName,
  HOST_OPERATION_SCHEMAS,
  type JsonObject,
  type Opened,
  type PageContent,
  type PageInfo,
  type PagesGetResult,
  type PagesListResult,
  type PagesPublishParams,
  type PagesVersionsResult,
  type Schema,
  TOOL_SCHEMAS,
  type TypeInfo,
  type TypesGetResult,
  type TypesListResult,
  type TypesPublishParams,
} from "@agentpages/protocol";
import type { Driver, Reply, Viewing } from "../contract.js";

/** What a case found, and what the spec says it must find. */
export interface Check {
  got: unknown;
  want: unknown;
}

export type Cases = Record<string, (driver: Driver) => Promise<Check>>;

/** A tool, with the schema of its result. */
export interface Tool<R> {
  name: string;
  result: Schema<R>;
}

const tool = <R>(name: string, { result }: { result: Schema<R> }): Tool<R> => ({ name, result });

export const PUBLISH: Tool<PageInfo> = tool("pages_publish", TOOL_SCHEMAS.pages_publish);
export const GET: Tool<PagesGetResult> = tool("pages_get", TOOL_SCHEMAS.pages_get);
export const LIST: Tool<PagesListResult> = tool("pages_list", TOOL_SCHEMAS.pages_list);
export const VERSIONS: Tool<PagesVersionsResult> = tool("pages_versions", TOOL_SCHEMAS.pages_versions);
export const SET_ACCESS: Tool<PageInfo> = tool("pages_set_access", TOOL_SCHEMAS.pages_set_access);
export const DELETE: Tool<Empty> = tool("pages_delete", TOOL_SCHEMAS.pages_delete);
export const TYPE_PUBLISH: Tool<TypeInfo> = tool("types_publish", TOOL_SCHEMAS.types_publish);
export const TYPE_GET: Tool<TypesGetResult> = tool("types_get", TOOL_SCHEMAS.types_get);
export const TYPE_LIST: Tool<TypesListResult> = tool("types_list", TOOL_SCHEMAS.types_list);

/**
 * The result of a reply, typed by the schema it must match, with every field the reply carried: a case that spells
 * out what it wants sees a field the spec does not know. A reply that failed gives its failure instead.
 */
const resultIn = <R>(schema: Schema<R>, reply: Reply): R => {
  const verdict: { value?: R; issues?: unknown } = schema["~standard"].validate(reply.result);
  return Object.assign({}, reply.failure, verdict.value, reply.result);
};

/** The error a reply failed with. Nothing when the failure does not say what was wrong. */
const errorIn = (reply: Reply): string => {
  const { error, message } = Object.assign({}, reply.failure);
  return error.repeat(Math.sign(message.length));
};

export interface Session {
  /** The result of a tool call. */
  ok: <R>(tool: Tool<R>, input: unknown) => Promise<R>;
  /** The error of a tool call. */
  fails: (tool: Tool<unknown>, input: unknown) => Promise<string>;
}

/** The subject of agent `n`. */
export const agent = (n: number): string => `agent-${n}`;

export const actingAs = (driver: Driver, subject: string): Session => {
  const call = ({ name }: Tool<unknown>, input: unknown): Promise<Reply> => driver.call({ tool: name, input, subject });
  return {
    ok: async (asked, input) => resultIn(asked.result, await call(asked, input)),
    fails: async (asked, input) => errorIn(await call(asked, input)),
  };
};

const opening = (driver: Driver, viewer: Viewing): Promise<Reply> =>
  driver.host({ operation: "pages_open", input: { url: viewer.url }, viewer });

/** What a viewer gets who opens the link they hold. */
export const opens = async (driver: Driver, viewer: Viewing): Promise<Opened> =>
  resultIn(HOST_OPERATION_SCHEMAS.pages_open.result, await opening(driver, viewer));

export const openFails = async (driver: Driver, viewer: Viewing): Promise<string> => errorIn(await opening(driver, viewer));

/** Agent `n`, signed in and looking at a page. */
export const viewer = (n: number, url: string): Viewing => ({ subject: agent(n), url });

export const anonymous = (url: string): Viewing => ({ url });

const numbered = (n: number): string => String(n).padStart(12, "0");

export const pageId = (n: number): string => `00000000-0000-4000-8000-${numbered(n)}`;

let issued = 0;

/** An `opId` no request used before. */
const opId = (): string => {
  issued += 1;
  return `11111111-1111-4111-8111-${numbered(issued)}`;
};

/** A text no other number gives. */
export const text = (n: number): string => `Text ${n}`;

export const markup = (n: number): string => `<!doctype html><title>${n}</title>`;

export const html = (n: number): PageContent => ({ kind: "html", html: markup(n) });

/** Html of exactly `bytes` UTF-8 bytes and about half as many characters. */
export const htmlOfBytes = (bytes: number): PageContent => ({ kind: "html", html: ofBytes(bytes) });

/** What a version may carry besides its html. */
export const guards = (n: number): { csp: JsonObject; permissions: JsonObject } => ({
  csp: { connectDomains: [`https://${n}.example`], frames: { last: null, first: [n, { deep: true }] } },
  permissions: { camera: {} },
});

/** The params that publish a version of page `n`. */
export const page = (n: number, baseVersion: number): PagesPublishParams => ({
  opId: opId(),
  pageId: pageId(n),
  baseVersion,
  title: text(n),
  content: html(n),
});

/** The params that read page `n`. */
export const reading = (n: number): { pageId: string } => ({ pageId: pageId(n) });

/** The params that read one version of page 1. */
export const versionOf = (version: number): { pageId: string; version: number } => ({ ...reading(1), version });

/** The params that delete page `n`. */
export const deleting = (n: number): { opId: string; pageId: string } => ({ opId: opId(), ...reading(n) });

export const PRIVATE = "private";
export const LINK_READ = "link-read";
export const LINK_WRITE = "link-write";

/** The params that set the access of page `n`. */
export const sharing = (n: number, access: unknown): { opId: string; pageId: string; access: unknown } => ({
  ...deleting(n),
  access,
});

export const typeId = (n: number): string => `type-${n}`;

/** The params that publish a version of type `n`, which declares nothing. */
export const type = (n: number, baseVersion: number): TypesPublishParams => ({
  opId: opId(),
  typeId: typeId(n),
  baseVersion,
  title: text(n),
  description: text(n),
  instructions: text(n),
  collections: {},
  exports: {},
  content: { html: markup(n) },
});

/** A collection whose documents match `schema`. */
export const collection = (schema: unknown): { schema: unknown } => ({ schema });

/** The params that read type `n`. */
export const readingType = (n: number): { typeId: string } => ({ typeId: typeId(n) });

/** The content of a page of type `n`. */
export const typed = (n: number, typeVersion: number): PageContent => ({ kind: "type", typeId: typeId(n), typeVersion });

/** `params` with one field given another value. */
export const having = (params: object, [name, value]: [string, unknown]): unknown => ({ ...params, [name]: value });

export interface Owned {
  alice: Session;
  published: PageInfo;
}

/** Agent 1, with the first version of page 1 published. */
export const withPage = async (driver: Driver): Promise<Owned> => {
  const alice = actingAs(driver, agent(1));
  return { alice, published: await alice.ok(PUBLISH, page(1, 0)) };
};

const SECOND = 1000;

/** Lets a second pass, so that what happens next has a later time. */
export const tick = (driver: Driver): void => {
  driver.advance(SECOND);
};

/** Runs `each` for one item after the other. */
export const inTurn = <T>(items: readonly T[], each: (item: T) => Promise<unknown>): Promise<unknown> =>
  items.reduce<Promise<unknown>>((before, item) => before.then(() => each(item)), Promise.resolve());

/** Agent 1, with the first `count` versions of page 1 published. */
export const withVersions = async (driver: Driver, count: number): Promise<Session> => {
  const alice = actingAs(driver, agent(1));
  const bases = Array.from({ length: count }, (_, baseVersion) => baseVersion);
  await inTurn(bases, (baseVersion) => alice.ok(PUBLISH, page(1, baseVersion)));
  return alice;
};

/** A string of exactly `bytes` UTF-8 bytes and about half as many characters. */
export const ofBytes = (bytes: number): string => `${"é".repeat(Math.floor(bytes / 2))}${"a".repeat(bytes % 2)}`;

/** As many characters as `count`. */
export const ofLength = (count: number): string => String(1).repeat(count);

export const timeOf = (timestamp: string): number => Date.parse(timestamp);

/** `count` times the same error. */
export const times = (count: number, error: ErrorName): ErrorName[] => Array.from({ length: count }, () => error);
