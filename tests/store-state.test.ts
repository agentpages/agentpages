import { type Answer, LogRecordSchema, type StateListResult, TOOL_SCHEMAS, validate } from "@agentpages/protocol";
import { ajvSchemaCompiler, type Ports } from "@agentpages/server";
import type { Storage } from "@agentpages/storage";
import { expect, test } from "vitest";
import { savedRows, seqOf } from "./support/results.ts";
import { ask, BASE_URL, call, callEach, COMMIT, committed, committing, declaring, errorOf, failureOf, op, PAGE, publishing, put, transactingAs, resultOf, saved, sharedPage, uuid, viewerId, world, type World } from "./support/store.ts";

const IDENTITY = "agentpages/identity/get";

/** A log record of a Store whose clock stands still, with these fields beside the ones every record has. */
const logged = (fields: object): object => ({ at: "2026-01-01T00:00:00.000Z", requestId: expect.any(String) as unknown, durationMs: 0, ...fields });

const listOf = async (target: World, pageId: string): Promise<StateListResult> =>
  resultOf(TOOL_SCHEMAS.state_list.result, await call(target, ["state_list", { pageId, scope: "page", collection: "tasks" }]));

test("[REL-26] the log record of a state request carries its scope, and that of a commit the seq it created or, for a repeat, got back", async () => {
  const { target, url } = await sharedPage();
  await call(target, committed(3, [put("a", { title: "Quarterly plan" })]));
  await call(target, committed(6, [put("b")]));
  await call(target, committed(3, [put("a", { title: "Quarterly plan" })]));
  await ask(target, { url, subject: "bob", method: COMMIT, params: { ...committing(4, [put("a")]), scope: "viewer" } });
  await ask(target, { url, method: COMMIT, params: committing(5, [{ ...put("a"), ifRevision: 7 }]) });
  await call(target, ["state_list", { pageId: PAGE, scope: "page", collection: "tasks" }]);
  await ask(target, { url, method: IDENTITY, params: {} });
  const records = target.logs.slice(2);

  expect(records).toStrictEqual([
    logged({ opId: op(3), pageId: PAGE, scope: "page", seq: 1, actor: { kind: "agent" }, method: "state_commit", outcome: "ok" }),
    logged({ opId: op(6), pageId: PAGE, scope: "page", seq: 2, actor: { kind: "agent" }, method: "state_commit", outcome: "ok" }),
    logged({ opId: op(3), pageId: PAGE, scope: "page", seq: 1, actor: { kind: "agent" }, method: "state_commit", outcome: "ok" }),
    logged({ opId: op(4), pageId: PAGE, scope: "viewer", seq: 1, actor: { kind: "viewer", id: viewerId({ subject: "bob", pageId: PAGE }) }, method: COMMIT, outcome: "ok" }),
    logged({ opId: op(5), pageId: PAGE, scope: "page", actor: { kind: "anonymous" }, method: COMMIT, outcome: "error", error: "Conflict" }),
    logged({ pageId: PAGE, scope: "page", actor: { kind: "agent" }, method: "state_list", outcome: "ok" }),
    logged({ pageId: PAGE, actor: { kind: "anonymous" }, method: IDENTITY, outcome: "ok" }),
  ]);
  expect(records.map((record) => validate(LogRecordSchema, record).ok)).toStrictEqual(records.map(() => true));
  expect(JSON.stringify(target.logs)).not.toMatch(/Quarterly|tasks|secret/u);
});

test("the page of a view request is the one its link names, whatever its params say", async () => {
  const { target, url } = await sharedPage();
  await call(target, ["pages_publish", publishing({ page: 2, baseVersion: 0, op: 9 })]);
  const smuggled = { ...committing(3, [put("a")]), pageId: uuid(2), url: `${BASE_URL}${uuid(2)}/secret` };
  const answer = await ask(target, { url, subject: "bob", method: COMMIT, params: smuggled });
  const elsewhere = [url.replace("pages.test", "pages.fake"), "not a url", `${BASE_URL}${uuid(7)}/secret`, `${BASE_URL}${uuid(2)}/secret`];
  const refused = await elsewhere.reduce<Promise<unknown[]>>(async (earlier, link) => {
    const before = await earlier;
    const failed = await ask(target, { url: link, subject: "bob", method: COMMIT, params: committing(4, [put("b")]) });
    return [...before, [errorOf(failed), target.logs.at(-1)?.pageId]];
  }, Promise.resolve([]));

  expect(answer.kind).toBe("result");
  expect([await listOf(target, PAGE), await listOf(target, uuid(2))].map((listed) => listed.documents.map((document) => document.id))).toStrictEqual([["a"], []]);
  expect(refused).toStrictEqual([
    ["NotFound", undefined],
    ["NotFound", undefined],
    ["NotFound", uuid(7)],
    ["Forbidden", uuid(2)],
  ]);
});

test("[REL-29] an agent and a viewer are different callers, and so are an anonymous viewer and one without a name", async () => {
  const { target, url } = await sharedPage();
  const params = committing(3, [put("a")]);
  const seqs = [
    await seqOf(call(target, ["state_commit", { pageId: PAGE, ...params }])),
    await seqOf(ask(target, { url, subject: "alice", method: COMMIT, params })),
    await seqOf(ask(target, { url, method: COMMIT, params })),
    await seqOf(ask(target, { url, subject: "", method: COMMIT, params })),
    await seqOf(ask(target, { url, subject: "anonymous", method: COMMIT, params })),
    await seqOf(ask(target, { url, method: COMMIT, params })),
  ];

  expect(seqs).toStrictEqual([1, 2, 3, 4, 5, 3]);
});

test("[STATE-6] the scope of one viewer is never that of another, whatever their subjects are", async () => {
  const { target, url } = await sharedPage();
  const subjects = ["team", "team/alice", "team/alice/é", "team%2Falice", ""];
  const own = (subject: string, request: { method: string; params: object }): Promise<Answer> =>
    ask(target, { url, subject, method: request.method, params: { ...request.params, scope: "viewer" } });
  await Promise.all(subjects.map((subject, n) => own(subject, { method: COMMIT, params: committing(n, [put("a", { of: subject })]) })));
  const read = await Promise.all(subjects.map((subject) => own(subject, { method: "agentpages/state/get", params: { collection: "tasks", id: "a" } })));

  expect(read.map((answer) => resultOf(TOOL_SCHEMAS.state_get.result, answer).document?.data)).toStrictEqual(subjects.map((subject) => ({ of: subject })));
  expect((await listOf(target, PAGE)).documents).toStrictEqual([]);
});

test("[PAGES-14] pages_delete removes the state of the page: every scope, every log and every counter, and no other page's", async () => {
  const { target, url } = await sharedPage();
  await call(target, ["pages_publish", publishing({ page: 2, baseVersion: 0, op: 9 })]);
  await call(target, committed(3, [put("a"), { ...put("b"), collection: "notes" }]));
  await call(target, committed(4, [{ op: "delete", collection: "tasks", id: "a" }]));
  await ask(target, { url, subject: "bob", method: COMMIT, params: { ...committing(5, [put("a")]), scope: "viewer" } });
  await ask(target, { url, subject: "carol", method: COMMIT, params: { ...committing(5, [put("a")]), scope: "viewer" } });
  const other = await seqOf(call(target, ["state_commit", { pageId: uuid(2), ...committing(6, [put("a")]) }]));
  await call(target, ["pages_delete", { opId: op(7), pageId: PAGE }]);
  const kept = await listOf(target, uuid(2));
  await call(target, ["pages_delete", { opId: op(8), pageId: uuid(2) }]);

  expect([other, kept.seq, kept.documents.map((document) => document.id)]).toStrictEqual([1, 1, ["a"]]);
  expect(await savedRows(target.storage)).toStrictEqual([
    [`gone/${PAGE}`, {}],
    [`gone/${uuid(2)}`, {}],
    [expect.stringContaining(op(7)), expect.objectContaining({ result: {} })],
    [expect.stringContaining(op(8)), expect.objectContaining({ result: {} })],
  ]);
});

/** `storage`, whose transactions find another result in what it remembers of the request with this `opId`. */
const spoiling = (storage: Storage, opId: string): Storage =>
  transactingAs(storage, (tx) => ({
    get: async (key) => (key.includes(opId) ? Object.assign({}, await tx.get(key), { result: { commit: "lost" } }) : tx.get(key)),
  }));

test("[REL-27] a remembered commit that the storage damaged is an Internal error", async () => {
  const { target } = await sharedPage();
  await call(target, committed(3, [put("a")]));
  const broken = world({ ports: { storage: spoiling(target.storage, op(3)) } });
  const repeated = await call(broken, committed(3, [put("a")]));

  expect(errorOf(repeated)).toBe("Internal");
  expect(broken.logs).toStrictEqual([expect.objectContaining({ error: "Internal", cause: "CorruptRecord", pageId: PAGE, scope: "page" })]);
});

/** A compiler that takes every schema until it is `broken`, and none after. */
const fickle = (state: { broken: boolean }): Ports["compiler"] => ({
  compile: (schema) => (state.broken ? { error: "InvalidParams", message: "The compiler changed its mind." } : ajvSchemaCompiler.compile(schema)),
});

test("[REL-27] a type whose stored schema no longer compiles is an Internal error, and the commit changes nothing", async () => {
  const state = { broken: false };
  const target = world({ ports: { compiler: fickle(state) } });
  await call(target, ["types_publish", { ...declaring("deck", 1), collections: { tasks: { schema: {} } } }]);
  await call(target, ["pages_publish", { ...publishing({ page: 1, baseVersion: 0, op: 2 }), content: { kind: "type", typeId: "deck", typeVersion: 1 } }]);
  const before = await saved(target.storage);
  state.broken = true;
  const answer = await call(target, committed(3, [put("a")]));

  expect(errorOf(answer)).toBe("Internal");
  expect(target.logs.at(-1)).toStrictEqual(expect.objectContaining({ error: "Internal", cause: "CorruptRecord", scope: "page" }));
  expect(await saved(target.storage)).toStrictEqual(before);
});

/** `PAGE` as a page of a type whose tasks have a title that is a text. */
const TITLED: [string, unknown][] = [
  ["types_publish", { ...declaring("deck", 1), collections: { tasks: { schema: { required: ["title"], properties: { title: { type: "string" } } } } } }],
  ["pages_publish", { ...publishing({ page: 1, baseVersion: 0, op: 2 }), content: { kind: "type", typeId: "deck", typeVersion: 1 } }],
];

const blamed = (answer: Answer): unknown[] => [failureOf(answer)?.message, failureOf(answer)?.opIndex];

test("[ERR-3] the message of a commit that the type of its page does not allow names the op and what is wrong with it", async () => {
  const target = world();
  await callEach(target, TITLED);
  const answers = [
    await call(target, committed(3, [put("a", { title: "Plan" }), { ...put("a"), collection: "notes" }])),
    await call(target, committed(4, [put("a", { title: 7 })])),
    await call(target, committed(5, [put("a", { title: "Plan" }), put("b")])),
    await call(target, committed(6, [{ ...put("a", { title: "Plan" }), ifRevision: 3 }])),
    await call(target, committed(7, [{ ...put("a"), collection: "constructor" }])),
  ];

  expect(answers.map(blamed)).toStrictEqual([
    ["op 1: the type does not declare the collection notes", 1],
    ["op 0: data.title: must be string", 0],
    ["op 1: data: must have required property 'title'", 1],
    ["The ifRevision of op 0 no longer holds.", 0],
    ["op 0: the type does not declare the collection constructor", 0],
  ]);
});

test("[ERR-3] an issue of the schema compiler that names no place is about the data as a whole", async () => {
  const target = world({ ports: { compiler: { compile: () => ({ check: () => [{ message: "is not wanted" }] }) } } });
  await callEach(target, TITLED);

  expect(blamed(await call(target, committed(3, [put("a")])))).toStrictEqual(["op 0: data: is not wanted", 0]);
});
