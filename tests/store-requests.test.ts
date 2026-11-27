import type { Reply } from "@agentpages/conformance";
import { ID_PATTERN, LogRecordSchema, type PageInfo, TOOL_SCHEMAS, validate } from "@agentpages/protocol";
import type { Ports, RateRequest, Storage, Value } from "@agentpages/server";
import { expect, test } from "vitest";
import { ALICE, BASE_URL, BOB, call, declaring, HTML, op, PAGE, PUBLISHED, publishing, resultOf, saved, START, uuid, world, type World } from "./support/store.ts";

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
  await target.host({ operation: "pages_open", input: { url: shared.url }, principal: { kind: "anonymous", url: shared.url } });
  await target.host({ operation: "pages_open", input: { url: `${BASE_URL}nowhere` }, principal: { kind: "anonymous" } });

  expect(target.logs).toStrictEqual([
    { at: "2026-01-01T00:00:00.000Z", requestId: "request-1", opId: op(1), pageId: PAGE, actor: { kind: "agent" }, method: "pages_publish", outcome: "ok", durationMs: 7 },
    { at: "2026-01-01T00:00:00.014Z", requestId: "request-3", opId: op(2), pageId: PAGE, actor: { kind: "agent" }, method: "pages_set_access", outcome: "ok", durationMs: 7 },
    { at: "2026-01-01T00:00:00.028Z", requestId: "request-5", pageId: uuid(2), actor: { kind: "agent" }, method: "pages_get", outcome: "error", error: "NotFound", durationMs: 7 },
    { at: "2026-01-01T00:00:00.042Z", requestId: "request-6", actor: { kind: "agent" }, method: "pages_publish", outcome: "error", error: "InvalidParams", durationMs: 7 },
    { at: "2026-01-01T00:00:00.056Z", requestId: "request-7", opId: op(4), actor: { kind: "agent" }, method: "types_publish", outcome: "ok", durationMs: 7 },
    { at: "2026-01-01T00:00:00.070Z", requestId: "request-8", pageId: PAGE, actor: { kind: "anonymous" }, method: "pages_open", outcome: "ok", durationMs: 7 },
    { at: "2026-01-01T00:00:00.084Z", requestId: "request-9", actor: { kind: "anonymous" }, method: "pages_open", outcome: "error", error: "NotFound", durationMs: 7 },
  ]);
  expect(target.logs.map((record) => validate(LogRecordSchema, record).ok)).toStrictEqual(target.logs.map(() => true));
});

test("[REL-24] a log record names a viewer by an id that is the same for the same person and never the subject", async () => {
  const target = world();
  const { url } = await publish(target).then(() => share(target, 2));
  const open = (subject: string): Promise<Reply> =>
    target.host({ operation: "pages_open", input: { url }, principal: { kind: "viewer", subject, url } });
  await open("carol@example.com").then(() => open("dave@example.com")).then(() => open("carol@example.com"));
  const [carol, dave, again] = target.logs.slice(2).map((record) => record.actor);

  expect([carol, dave, again]).toStrictEqual(Array.from({ length: 3 }, () => ({ kind: "viewer", id: expect.stringMatching(/^[0-9a-f]{64}$/u) as unknown })));
  expect(again).toStrictEqual(carol);
  expect(dave).not.toStrictEqual(carol);
  expect(target.logs.map((record) => validate(LogRecordSchema, record).ok)).toStrictEqual([true, true, true, true, true]);
});

test("[REL-25] the Store chooses the requestId of a tool call, and a failure and its log record share it", async () => {
  const target = world();
  const answers = [await call(target, ["pages_get", { pageId: PAGE }]), await call(target, ["pages_get", { pageId: 7 }]), await call(target, PUBLISHED)];
  const requestIds = target.logs.map((record) => record.requestId);

  expect(answers.map((answer) => answer.failure?.requestId)).toStrictEqual([requestIds[0], requestIds[1], undefined]);
  expect(new Set(requestIds).size).toBe(3);
  expect(requestIds.filter((requestId) => ID_PATTERN.test(requestId))).toStrictEqual(requestIds);
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
  request: [string, unknown];
}

/** A storage whose transactions read `damaged` for the keys that contain `under`. */
const damaging = (storage: Storage, { under, damaged }: Damage): Storage => ({
  ...storage,
  transact: (locks, run) =>
    storage.transact(locks, (tx) =>
      run({ ...tx, get: async (key) => (key.includes(under) && (await tx.get(key)) !== undefined ? damaged : tx.get(key)) }),
    ),
});

const DAMAGES: Damage[] = [
  { under: "/meta", damaged: new Uint8Array([1]), request: ["pages_get", { pageId: PAGE }] },
  { under: "/meta", damaged: { title: 7 }, request: ["pages_get", { pageId: PAGE }] },
  { under: "/op/", damaged: new Uint8Array([1]), request: PUBLISHED },
];

test.each(DAMAGES)("[REL-27] a record the storage damaged is an Internal error: $under as $damaged", async (damage) => {
  const target = world();
  await call(target, PUBLISHED);
  const broken = world({ ports: { storage: damaging(target.storage, damage) } });
  const answer = await call(broken, damage.request);

  expect(answer.failure?.error).toBe("Internal");
  expect(broken.logs).toStrictEqual([expect.objectContaining({ pageId: PAGE, error: "Internal", cause: "CorruptRecord" })]);
});

test("[REL-28] no field of a log record carries html, document data, a link or what a defect said", async () => {
  const target = world();
  const { url } = await publish(target).then(() => share(target, 2));
  await call(target, ["pages_publish", { ...publishing({ page: 1, baseVersion: 1, op: 3 }), title: "Quarterly plan", description: "Do not leak" }]);
  await call(target, ["pages_publish", { ...publishing({ page: 1, baseVersion: 9, op: 4 }), content: { kind: "html", html: "<p>stale</p>" } }]);
  await call(target, ["types_publish", { ...declaring("deck", 5), collections: { tasks: { schema: { title: "hidden", type: 7 } } } }]);
  await target.host({ operation: "pages_open", input: { url }, principal: { kind: "viewer", subject: "carol@example.com", name: "Carol", url } });
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
    return JSON.stringify(request.principal) === JSON.stringify(BOB) ? { retryAfterMs: 1500 } : undefined;
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
