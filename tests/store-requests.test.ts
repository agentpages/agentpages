import { type Answer, ID_PATTERN, LogRecordSchema, type PageInfo, TOOL_SCHEMAS, validate } from "@agentpages/protocol";
import type { Ports, RateRequest } from "@agentpages/server";
import type { Storage, Value } from "@agentpages/storage";
import { expect, test } from "vitest";
import { ALICE, BASE_URL, BOB, call, committed, declaring, errorOf, failureOf, HOST_REQUEST, HTML, op, open, PAGE, PUBLISHED, publishing, put, readingAs, resultOf, saved, START, uuid, viewerId, world, type World } from "./support/store.ts";

const publish = async (target: World): Promise<PageInfo> =>
  resultOf(TOOL_SCHEMAS.pages_publish.result, await call(target, PUBLISHED));

const share = async (target: World, opNumber: number): Promise<PageInfo> =>
  resultOf(TOOL_SCHEMAS.pages_set_access.result, await call(target, ["pages_set_access", { opId: op(opNumber), pageId: PAGE, access: "link-read" }]));

/** A clock that is seven milliseconds later every time it is read. */
const ticking = (): Ports["clock"] => {
  const read = { times: 0 };
  return {
    now: () => {
      read.times += 1;
      return START + (read.times - 1) * 7;
    },
  };
};

test("[REL-24] the Store writes one log record for every request it handles, whatever the outcome", async () => {
  const target = world({ ports: { clock: ticking() } });
  const shared = await publish(target).then(() => share(target, 2));
  await call(target, ["pages_get", { pageId: uuid(2) }]);
  await call(target, ["pages_publish", { ...publishing({ page: 1, baseVersion: 0, op: 3 }), pageId: "not a page", opId: "not an op" }]);
  await call(target, ["types_publish", declaring("deck", 4)]);
  await open(target, { url: shared.url });
  await open(target, { url: `${BASE_URL}nowhere` });

  expect(target.logs).toStrictEqual([
    { at: "2026-01-01T00:00:00.000Z", requestId: "request-1", opId: op(1), pageId: PAGE, actor: { kind: "agent" }, method: "pages_publish", outcome: "ok", durationMs: 7 },
    { at: "2026-01-01T00:00:00.014Z", requestId: "request-3", opId: op(2), pageId: PAGE, actor: { kind: "agent" }, method: "pages_set_access", outcome: "ok", durationMs: 7 },
    { at: "2026-01-01T00:00:00.028Z", requestId: "request-5", pageId: uuid(2), actor: { kind: "agent" }, method: "pages_get", outcome: "error", error: "NotFound", durationMs: 7 },
    { at: "2026-01-01T00:00:00.042Z", requestId: "request-6", actor: { kind: "agent" }, method: "pages_publish", outcome: "error", error: "InvalidParams", durationMs: 7 },
    { at: "2026-01-01T00:00:00.056Z", requestId: "request-7", opId: op(4), actor: { kind: "agent" }, method: "types_publish", outcome: "ok", durationMs: 7 },
    { at: "2026-01-01T00:00:00.070Z", requestId: "host-request", pageId: PAGE, actor: { kind: "anonymous" }, method: "pages_open", outcome: "ok", durationMs: 7 },
    { at: "2026-01-01T00:00:00.084Z", requestId: "host-request", actor: { kind: "anonymous" }, method: "pages_open", outcome: "error", error: "NotFound", durationMs: 7 },
  ]);
  expect(target.logs.map((record) => validate(LogRecordSchema, record).ok)).toStrictEqual(target.logs.map(() => true));
});

test("[REL-24] a log record names a viewer by the id they have on the page, which is the same for the same person and never the subject", async () => {
  const target = world();
  const { url } = await publish(target).then(() => share(target, 2));
  const openAs = (subject: string): Promise<Answer> => open(target, { url, subject });
  await openAs("carol@example.com").then(() => openAs("dave@example.com")).then(() => openAs("carol@example.com"));
  const [carol, dave, again] = target.logs.slice(2).map((record) => record.actor);

  expect([carol, dave, again]).toStrictEqual(["carol@example.com", "dave@example.com", "carol@example.com"].map((subject) => ({ kind: "viewer", id: viewerId({ subject, pageId: PAGE }) })));
  expect(again).toStrictEqual(carol);
  expect(dave).not.toStrictEqual(carol);
  expect(target.logs.map((record) => validate(LogRecordSchema, record).ok)).toStrictEqual([true, true, true, true, true]);
});

test("[REL-25] the Store chooses the requestId of a tool call, and a failure and its log record share it", async () => {
  const target = world();
  const answers = [await call(target, ["pages_get", { pageId: PAGE }]), await call(target, ["pages_get", { pageId: 7 }]), await call(target, PUBLISHED)];
  const requestIds = target.logs.map((record) => record.requestId);

  expect(answers.map((answer) => failureOf(answer)?.requestId)).toStrictEqual([requestIds[0], requestIds[1], undefined]);
  expect(new Set(requestIds).size).toBe(3);
  expect(requestIds.filter((requestId) => ID_PATTERN.test(requestId))).toStrictEqual(requestIds);
});

test("[REL-25] a host chooses the requestId of a view request, and the failure and the log record of the Store carry it", async () => {
  const target = world();
  const { url } = await publish(target);
  const openAs = (subject: string, requestId: string): Promise<Answer> =>
    target.host({ operation: "pages_open", input: { url }, principal: { kind: "viewer", subject }, requestId });
  const answers = [await openAs("alice", "view_1-A"), await openAs("bob", "view-2")];

  expect(answers.map((answer) => [answer.kind, failureOf(answer)?.requestId])).toStrictEqual([["result", undefined], ["failure", "view-2"]]);
  expect(target.logs.slice(1).map((record) => [record.requestId, record.outcome])).toStrictEqual([["view_1-A", "ok"], ["view-2", "error"]]);
});

test.each(["", "not an id", "x".repeat(129)])("[COMMON-1] a requestId of a host that is not an id is malformed, and answered under an id of the Store: %s", async (requestId) => {
  const target = world();
  const { url } = await publish(target);
  const before = await saved(target.storage);
  const answer = await target.host({ operation: "pages_open", input: { url }, principal: { kind: "viewer", subject: "alice" }, requestId });

  expect(answer).toStrictEqual({
    kind: "failure",
    failure: { error: "InvalidParams", retryable: false, requestId: "request-3", message: "requestId: Expected an id." },
  });
  expect(target.logs.slice(1)).toStrictEqual([expect.objectContaining({ requestId: "request-3", pageId: PAGE, method: "pages_open", error: "InvalidParams" })]);
  expect(await saved(target.storage)).toStrictEqual(before);
});

const LONE = "\uD83D";

/** Principals with half of a surrogate pair in their text, and one with a whole pair. */
const askedByStrays = (target: World, url: string): Promise<Answer>[] => [
  target.call({ tool: "pages_list", input: {}, principal: { kind: "agent", subject: `team-${LONE}` } }),
  target.call({ tool: "pages_publish", input: publishing({ page: 2, baseVersion: 0, op: 2 }), principal: { kind: "agent", subject: LONE } }),
  target.host({ operation: "pages_open", input: { url }, principal: { kind: "viewer", subject: `${LONE}x` }, requestId: HOST_REQUEST }),
  target.host({ operation: "pages_open", input: { url }, principal: { kind: "viewer", subject: "alice", name: LONE }, requestId: HOST_REQUEST }),
  target.call({ tool: "pages_publish", input: publishing({ page: 3, baseVersion: 0, op: 3 }), principal: { kind: "agent", subject: "\u{1F600}" } }),
];

test("a principal whose text is not well-formed Unicode is malformed, and the request does nothing", async () => {
  const target = world();
  const { url } = await publish(target);
  const answers = await Promise.all(askedByStrays(target, url));
  const stored = await saved(target.storage);

  expect(answers.map((answer) => [errorOf(answer), failureOf(answer)?.message])).toStrictEqual([
    ...Array.from({ length: 4 }, () => ["InvalidParams", "principal: Expected well-formed Unicode."]),
    [undefined, undefined],
  ]);
  expect(target.logs.slice(1).filter((record) => record.outcome === "error").map((record) => record.error)).toStrictEqual(["InvalidParams", "InvalidParams", "InvalidParams", "InvalidParams"]);
  expect(target.logs.slice(1).filter((record) => record.outcome === "ok")).toHaveLength(1);
  expect(JSON.stringify(stored)).toContain(uuid(3));
  expect(JSON.stringify(stored)).not.toContain(uuid(2));
});

test("[REL-32] a log record that cannot be written is lost, and the answer is what it would have been", async () => {
  const [mute, heard] = [world({ ports: { logger: { log: thrower(new Error("The disk is full.")) } } }), world()];
  const requests: [string, unknown][] = [PUBLISHED, ["pages_get", { pageId: uuid(2) }], ["pages_get", { pageId: PAGE }]];
  const answersOf = (target: World): Promise<Answer[]> =>
    requests.reduce<Promise<Answer[]>>(async (earlier, request) => [...(await earlier), await call(target, request)], Promise.resolve([]));
  const answers = await answersOf(mute);

  expect(answers).toStrictEqual(await answersOf(heard));
  expect(answers.map((answer) => answer.kind)).toStrictEqual(["result", "failure", "result"]);
  expect(await saved(mute.storage)).toStrictEqual(await saved(heard.storage));
  expect(heard.logs).toHaveLength(3);
});

interface Defect {
  ports: Partial<Ports>;
  request: [string, unknown];
  cause: string;
}

const thrower = (error: unknown) => (): never => {
  throw error;
};

const DEFECTS: Defect[] = [
  { ports: { limiter: { check: thrower(new TypeError(`cannot read ${HTML}`)) } }, request: PUBLISHED, cause: "TypeError" },
  { ports: { ids: { id: () => "request", secret: thrower("the secret generator broke") } }, request: PUBLISHED, cause: "string" },
  { ports: { compiler: { compile: thrower(new RangeError("too deep")) } }, request: ["types_publish", { ...declaring("deck", 1), collections: { tasks: { schema: {} } } }], cause: "RangeError" },
];

test.each(DEFECTS)("[REL-27] a defect is an Internal error whose log record carries its cause: $cause", async ({ ports, request, cause }) => {
  const target = world({ ports });
  const answer = await call(target, request);

  expect(answer).toStrictEqual({
    kind: "failure",
    failure: { error: "Internal", retryable: false, requestId: target.logs[0]?.requestId, message: expect.stringMatching(/log/u) as unknown },
  });
  expect(target.logs).toStrictEqual([expect.objectContaining({ outcome: "error", error: "Internal", cause })]);
  expect(JSON.stringify([answer, target.logs])).not.toMatch(/doctype|broke|too deep/u);
  expect(await saved(target.storage)).toStrictEqual([]);
});

interface Damage {
  /** Part of the keys whose values are damaged. */
  under: string;
  damaged: Value;
  /** What the request is, for the title of its test. */
  asking: string;
  ask: (target: World) => Promise<Answer>;
  /** What the log record says the request was about. */
  names: { pageId?: string };
}

/** A storage whose transactions read `damaged` for the keys that contain `under`. */
const damaging = (storage: Storage, { under, damaged }: Damage): Storage => {
  const spoiled = (key: string | undefined, stored: Value | undefined): Value | undefined =>
    stored !== undefined && key?.includes(under) === true ? damaged : stored;
  return readingAs(storage, (tx) => ({
    get: async (key) => spoiled(key, await tx.get(key)),
    getMany: async (keys) => (await tx.getMany(keys)).map((stored, index) => spoiled(keys[index], stored)),
    scan: async (range) => (await tx.scan(range)).map(([key, stored]) => [key, spoiled(key, stored) ?? stored]),
  }));
};

const LINK = `${BASE_URL}${PAGE}/secret`;

/** A page and a type as the Store saves them, but for the owner. */
const OWNERLESS_PAGE = { pageId: PAGE, title: "Page", version: 1, access: "link-read", url: LINK, updatedAt: "2026-01-01T00:00:00.000Z" };
const OWNERLESS_TYPE = { ...declaring("deck", 2), version: 1, updatedAt: "2026-01-01T00:00:00.000Z" };

const getPage = (target: World): Promise<Answer> => call(target, ["pages_get", { pageId: PAGE }]);

const IN_TASKS = { pageId: PAGE, scope: "page", collection: "tasks" };

const DAMAGES: Damage[] = [
  { under: "/meta", damaged: new Uint8Array([1]), asking: "pages_get", ask: getPage, names: { pageId: PAGE } },
  { under: "/meta", damaged: { title: 7, owner: "alice" }, asking: "pages_get", ask: getPage, names: { pageId: PAGE } },
  { under: "/op/", damaged: new Uint8Array([1]), asking: "pages_publish", ask: (target) => call(target, PUBLISHED), names: { pageId: PAGE } },
  { under: "/meta", damaged: OWNERLESS_PAGE, asking: "pages_get of its owner", ask: getPage, names: { pageId: PAGE } },
  { under: "/meta", damaged: OWNERLESS_PAGE, asking: "pages_open of a link holder", ask: (target) => open(target, { url: LINK }), names: { pageId: PAGE } },
  { under: "/meta", damaged: { ...OWNERLESS_PAGE, owner: 7 }, asking: "pages_get", ask: getPage, names: { pageId: PAGE } },
  {
    under: "types/deck",
    damaged: OWNERLESS_TYPE,
    asking: "types_publish",
    ask: (target) => call(target, ["types_publish", { ...declaring("deck", 3), baseVersion: 1 }]),
    names: {},
  },
  { under: "types/deck", damaged: OWNERLESS_TYPE, asking: "types_get", ask: (target) => call(target, ["types_get", { typeId: "deck" }]), names: {} },
  { under: "/s/p/head", damaged: { seq: "1" }, asking: "state_commit", ask: (target) => call(target, committed(6, [put("b")])), names: { pageId: PAGE } },
  { under: "/s/p/head", damaged: new Uint8Array([1]), asking: "state_list", ask: (target) => call(target, ["state_list", IN_TASKS]), names: { pageId: PAGE } },
  { under: "/s/p/r/", damaged: { revision: "1" }, asking: "state_commit", ask: (target) => call(target, committed(6, [put("a")])), names: { pageId: PAGE } },
  { under: "/s/p/d/", damaged: new Uint8Array([1]), asking: "state_get", ask: (target) => call(target, ["state_get", { ...IN_TASKS, id: "a" }]), names: { pageId: PAGE } },
  { under: "/s/p/d/", damaged: { id: 7 }, asking: "state_list", ask: (target) => call(target, ["state_list", IN_TASKS]), names: { pageId: PAGE } },
  { under: "/s/p/l/", damaged: { seq: "1" }, asking: "state_commits", ask: (target) => call(target, ["state_commits", { pageId: PAGE, scope: "page", since: 0 }]), names: { pageId: PAGE } },
];

test.each(DAMAGES)("[REL-27] a record the storage damaged is an Internal error: $under as $damaged, read by $asking", async (damage) => {
  const target = world();
  await call(target, PUBLISHED).then(() => call(target, ["types_publish", declaring("deck", 2)]));
  await call(target, committed(5, [put("a")]));
  const before = await saved(target.storage);
  const broken = world({ ports: { storage: damaging(target.storage, damage) } });
  const answer = await damage.ask(broken);

  expect(errorOf(answer)).toBe("Internal");
  expect(broken.logs).toStrictEqual([expect.objectContaining({ error: "Internal", cause: "CorruptRecord" })]);
  expect(broken.logs.map((record) => record.pageId)).toStrictEqual([damage.names.pageId]);
  expect(await saved(target.storage)).toStrictEqual(before);
});

test("[REL-28] no field of a log record carries html, document data, a link or what a defect said", async () => {
  const target = world();
  const { url } = await publish(target).then(() => share(target, 2));
  await call(target, ["pages_publish", { ...publishing({ page: 1, baseVersion: 1, op: 3 }), title: "Quarterly plan", description: "Do not leak" }]);
  await call(target, ["pages_publish", { ...publishing({ page: 1, baseVersion: 9, op: 4 }), content: { kind: "html", html: "<p>stale</p>" } }]);
  await call(target, ["types_publish", { ...declaring("deck", 5), collections: { tasks: { schema: { title: "hidden", type: 7 } } } }]);
  await target.host({ operation: "pages_open", input: { url }, principal: { kind: "viewer", subject: "carol@example.com", name: "Carol" }, requestId: HOST_REQUEST });
  const written = JSON.stringify(target.logs);

  expect(target.logs).toHaveLength(6);
  expect(written).not.toMatch(/doctype|stale|Quarterly|leak|hidden|secret|pages\.test|carol|Carol|baseVersion|schema/u);
  expect(target.logs.flatMap((record) => Object.keys(record)).filter((field) => !Object.hasOwn(LOGGED, field))).toStrictEqual([]);
});

const LOGGED = { at: 1, requestId: 1, opId: 1, pageId: 1, actor: 1, method: 1, outcome: 1, error: 1, durationMs: 1 };

/** Lets everyone through but bob, and notes what it was asked. */
const limitingBob = (asked: RateRequest[]): Ports["limiter"] => ({
  check: (request) => {
    asked.push(request);
    return Promise.resolve(JSON.stringify(request.principal) === JSON.stringify(BOB) ? { retryAfterMs: 1500 } : undefined);
  },
});

test("[REL-22] a Store that limits request rates answers RateLimited with a retryAfterMs, and does nothing else", async () => {
  const asked: RateRequest[] = [];
  const target = world({ ports: { limiter: limitingBob(asked) } });
  await call(target, PUBLISHED);
  const before = await saved(target.storage);
  const limited = await Promise.all([
    target.call({ tool: "pages_delete", input: { opId: op(2), pageId: PAGE }, principal: BOB }),
    target.call({ tool: "pages_get", input: { pageId: "malformed" }, principal: BOB }),
    target.call({ tool: "types_list", input: {}, principal: BOB }),
  ]);

  expect(limited).toStrictEqual(
    target.logs.slice(1).map(({ requestId }) => ({
      kind: "failure",
      failure: { error: "RateLimited", retryable: true, retryAfterMs: 1500, requestId, message: expect.stringContaining("1500") as unknown },
    })),
  );
  expect(target.logs.slice(1).map((record) => [record.method, record.outcome, record.error])).toStrictEqual([
    ["pages_delete", "error", "RateLimited"],
    ["pages_get", "error", "RateLimited"],
    ["types_list", "error", "RateLimited"],
  ]);
  expect(asked).toStrictEqual([
    { principal: ALICE, method: "pages_publish", pageId: PAGE },
    { principal: BOB, method: "pages_delete", pageId: PAGE },
    { principal: BOB, method: "pages_get", pageId: undefined },
    { principal: BOB, method: "types_list", pageId: undefined },
  ]);
  expect(await saved(target.storage)).toStrictEqual(before);
});

test("[REL-22] a rate limiter that cannot tell makes the request unavailable, and the request does nothing", async () => {
  const target = world({ ports: { limiter: { check: () => Promise.reject(new Error("The limiter is down.")) } } });
  const answer = await call(target, PUBLISHED);

  expect(answer).toStrictEqual({
    kind: "failure",
    failure: { error: "Unavailable", retryable: true, requestId: "request-1", message: "The rate limiter did not answer. Repeat the request with the same opId." },
  });
  expect(target.logs).toStrictEqual([{ at: "2026-01-01T00:00:00.000Z", requestId: "request-1", opId: op(1), pageId: PAGE, actor: { kind: "agent" }, method: "pages_publish", outcome: "error", error: "Unavailable", durationMs: 0 }]);
  expect(await saved(target.storage)).toStrictEqual([]);
});
