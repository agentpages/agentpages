import { type Answer, METHOD_NOT_FOUND, PROTOCOL_VERSION, TOOL_SCHEMAS } from "@agentpages/protocol";
import { expect, test } from "vitest";
import { ADVERTISED, ask, BASE_URL, call, declaring, errorOf, failureOf, HOST_REQUEST, HTML, op, open, PAGE, publishing, resultOf, saved, uuid, world, type World } from "./support/store.ts";

const { limits } = ADVERTISED;

const UNKNOWN = { kind: "unknown-method", code: METHOD_NOT_FOUND };

const PAGE_TOOLS = ["pages_publish", "pages_get", "pages_list", "pages_versions", "pages_set_access", "pages_delete"];
const STATE_TOOLS = ["state_get", "state_list", "state_commit", "state_commits"];
const FILE_TOOLS = ["files_put", "files_get", "files_list", "files_delete"];
const COMMENT_TOOLS = ["comments_list", "comments_reply", "comments_resolve"];
const TYPE_TOOLS = ["types_publish", "types_get", "types_list"];

test("[EXT-1] the Store exposes the limits and features it was given, under the version of the protocol", () => {
  const { state, identity, ...withoutSome } = ADVERTISED;

  expect(world().driver.capability).toStrictEqual({ version: PROTOCOL_VERSION, ...ADVERTISED });
  expect(world({ config: { capability: withoutSome } }).driver.capability).toStrictEqual({ version: "0.1", ...withoutSome });
  expect([state, identity]).toStrictEqual([ADVERTISED.state, {}]);
});

test("[EXT-5] each Store keeps to the limits it chose", async () => {
  const strict = world({ config: { capability: { limits: { ...limits, maxHtmlBytes: 33, maxSchemaBytes: 17 } } } });
  const schema = { description: "abcd" };
  const declared = { ...publishing({ page: 1, baseVersion: 0, op: 2 }), typeId: "deck", description: "", instructions: "", exports: {}, content: { html: "" } };
  const requests: [string, unknown][] = [published(0), ["types_publish", { ...declared, collections: { tasks: { schema } } }]];
  const answers = await Promise.all([...requests.map((request) => call(strict, request)), ...requests.map((request) => call(world(), request))]);

  expect(answers.map((answer) => errorOf(answer))).toStrictEqual(["LimitExceeded", "LimitExceeded", undefined, undefined]);
  expect(answers.map((answer) => failureOf(answer)?.message)).toStrictEqual([
    expect.stringContaining("maxHtmlBytes 33"),
    expect.stringContaining("maxSchemaBytes 17"),
    undefined,
    undefined,
  ]);
});

test("[PAGES-17] a typed page has no html of its own to measure", async () => {
  const tiny = world({ config: { capability: { limits: { ...limits, maxHtmlBytes: 5 } } } });
  const declared = { opId: op(1), typeId: "deck", baseVersion: 0, title: "Deck", description: "", instructions: "", collections: {}, exports: {}, content: { html: "<p>" } };
  const typed = { ...publishing({ page: 1, baseVersion: 0, op: 2 }), content: { kind: "type", typeId: "deck", typeVersion: 1 } };
  const answers = [await call(tiny, ["types_publish", declared]), await call(tiny, ["pages_publish", typed]), await call(tiny, published(0))];

  expect(answers.map((answer) => [answer.kind, errorOf(answer)])).toStrictEqual([
    ["result", undefined],
    ["result", undefined],
    ["failure", "LimitExceeded"],
  ]);
});

const published = (baseVersion: number): [string, unknown] => ["pages_publish", publishing({ page: 1, baseVersion, op: baseVersion + 1 })];

test("a Store that would forget commits before it forgets opIds is refused", () => {
  const shorter = { capability: { limits: { ...limits, commitRetentionSeconds: limits.opRetentionSeconds - 1 } } };
  const equal = { capability: { limits: { ...limits, commitRetentionSeconds: limits.opRetentionSeconds } } };

  expect(() => world({ config: shorter })).toThrow(new RangeError("commitRetentionSeconds must be at least opRetentionSeconds."));
  expect(world({ config: equal }).driver.capability.limits.commitRetentionSeconds).toBe(3600);
});

test("a Store is not created with a capability that is not one of section 3, or with a baseUrl that is not a URL", () => {
  const negative = { capability: { limits: { ...limits, maxHtmlBytes: -1 } } };
  const issues = JSON.stringify([{ message: "Expected >=0", path: ["limits", "maxHtmlBytes"] }]);

  expect(() => world({ config: negative })).toThrow(new TypeError(`The capability is not valid: ${issues}`));
  expect(() => world({ config: { baseUrl: "pages.test/p/" } })).toThrow(new TypeError("baseUrl must be a URL."));
});

const tools = (features: object): readonly string[] => world({ config: { capability: { limits, ...features } } }).tools;

test("the Store lists a tool exactly when it advertises the features the tool requires", () => {
  const { state, files, render } = ADVERTISED;
  const always = [...PAGE_TOOLS, ...COMMENT_TOOLS, ...TYPE_TOOLS];

  expect(new Set(world().tools)).toStrictEqual(new Set([...always, ...STATE_TOOLS, ...FILE_TOOLS, "pages_render", "pages_export"]));
  expect(new Set(tools({}))).toStrictEqual(new Set(always));
  expect(new Set(tools({ state }))).toStrictEqual(new Set([...always, ...STATE_TOOLS]));
  expect(new Set(tools({ files }))).toStrictEqual(new Set([...always, ...FILE_TOOLS]));
  expect(new Set(tools({ render }))).toStrictEqual(new Set([...always, "pages_render"]));
  expect(new Set(tools({ render, files }))).toStrictEqual(new Set([...always, ...FILE_TOOLS, "pages_render", "pages_export"]));
});

const FILE_METHODS = ["agentpages/files/put", "agentpages/files/get", "agentpages/files/list", "agentpages/files/delete"];
const TO_THE_VIEW = ["agentpages/view/reveal", "agentpages/view/export", "agentpages/state/committed"];

test("a tool, host operation or view method the Store does not have yet is the JSON-RPC method not found", async () => {
  const target = world();
  const later = [...FILE_TOOLS, ...COMMENT_TOOLS, "pages_render", "pages_export"];
  const notTools = [...later, "pages_open", "comments_start", "agentpages/state/get", "pages", "toString", "constructor", ""];
  const operations = ["comments_start", ...PAGE_TOOLS, ...TYPE_TOOLS, ...STATE_TOOLS, ...later, "toString", ""];
  const notMethods = [...FILE_METHODS, ...TO_THE_VIEW, ...STATE_TOOLS, "pages_get", "pages_open", "agentpages/state", "toString", "constructor", ""];
  const answers = [
    ...notTools.map((tool) => call(target, [tool, { pageId: PAGE }])),
    ...operations.map((operation) => target.host({ operation, input: { pageId: PAGE }, principal: { kind: "anonymous" }, requestId: HOST_REQUEST })),
    ...notMethods.map((method) => ask(target, { url: `${BASE_URL}${PAGE}/secret`, method, params: {} })),
  ];

  expect(await Promise.all(answers)).toStrictEqual(answers.map(() => UNKNOWN));
  expect(UNKNOWN.code).toBe(-32_601);
  expect([target.logs, await saved(target.storage)]).toStrictEqual([[], []]);
});

/** A Store with the first version of `PAGE`, the page's url, and its owner as a viewer who presents a url. */
const withPage = async (): Promise<{ target: World; url: string; openAs: (presented: string) => Promise<Answer> }> => {
  const target = world();
  const { url } = resultOf(TOOL_SCHEMAS.pages_publish.result, await call(target, published(0)));
  return { target, url, openAs: (presented) => open(target, { url: presented, subject: "alice" }) };
};

test("a tool is not a host operation, and a host operation is not a tool", async () => {
  const { target, url, openAs } = await withPage();
  const principal = { kind: "viewer", subject: "alice" } as const;

  expect(await call(target, ["pages_open", { url }])).toStrictEqual(UNKNOWN);
  expect(await target.host({ operation: "pages_get", input: { pageId: PAGE }, principal, requestId: HOST_REQUEST })).toStrictEqual(UNKNOWN);
  expect((await openAs(url)).kind).toBe("result");
});

test("[PAGES-12] the pages of one subject are never listed for another, whatever the subjects are", async () => {
  const target = world();
  const subjects = ["team", "team/alice", "team/alice/é", "team%2Falice", ""];
  const publish = (subject: string, page: number): Promise<Answer> =>
    target.call({ tool: "pages_publish", input: publishing({ page, baseVersion: 0, op: page }), principal: { kind: "agent", subject } });
  const list = async (subject: string): Promise<string[]> => {
    const answer = await target.call({ tool: "pages_list", input: {}, principal: { kind: "agent", subject } });
    return resultOf(TOOL_SCHEMAS.pages_list.result, answer).pages.map((page) => page.pageId);
  };
  await Promise.all(subjects.map(publish));

  expect(await Promise.all(subjects.map(list))).toStrictEqual([[uuid(0)], [uuid(1)], [uuid(2)], [uuid(3)], [uuid(4)]]);
});

test("[REL-29] an opId belongs to the page or type its request names: the same one elsewhere is another request", async () => {
  const target = world();
  const requests: [string, unknown][] = [
    ["pages_publish", publishing({ page: 1, baseVersion: 0, op: 1 })],
    ["pages_publish", publishing({ page: 2, baseVersion: 0, op: 1 })],
    ["types_publish", declaring("deck", 1)],
    ["types_publish", declaring("board", 1)],
  ];
  const answers = await Promise.all(requests.map((request) => call(target, request)));

  expect(answers.map((answer) => answer.kind)).toStrictEqual(["result", "result", "result", "result"]);
});

test("[REL-2] a repeat that carries a field the spec does not know is the same request", async () => {
  const target = world();
  const request = publishing({ page: 1, baseVersion: 0, op: 1 });
  const first = await call(target, ["pages_publish", request]);
  const repeat = await call(target, ["pages_publish", { ...request, notInTheSpec: true, content: { kind: "html", html: HTML, alsoNot: 1 } }]);

  expect(repeat).toStrictEqual(first);
  expect(first.kind).toBe("result");
});

const withCsp = (hosts: unknown): [string, unknown] => [
  "pages_publish",
  { ...publishing({ page: 1, baseVersion: 0, op: 1 }), content: { kind: "html", html: HTML, csp: { hosts, none: null } } },
];

test("[REL-3] an array and an object with its indexes as keys are different params", async () => {
  const target = world();
  const answers = [await call(target, withCsp([1, 2])), await call(target, withCsp({ 0: 1, 1: 2 })), await call(target, withCsp([2, 1]))];

  expect(answers.map((answer) => errorOf(answer))).toStrictEqual([undefined, "InvalidParams", "InvalidParams"]);
});

const declared = (typeId: string, tasks: object): [string, unknown] => ["types_publish", { ...declaring(typeId, 1), collections: { tasks } }];

const second = (typeId: string, tasks: object): [string, unknown] => [
  "types_publish",
  { ...declaring(typeId, 2), baseVersion: 1, collections: { tasks } },
];

test("[TYPES-12] each type keeps to its own collections", async () => {
  const target = world();
  await call(target, declared("deck", { schema: {}, tree: true })).then(() => call(target, declared("board", { schema: {} })));
  const answers = [await call(target, second("deck", { schema: {} })), await call(target, second("deck", { schema: {}, tree: true }))];

  expect(answers.map((answer) => errorOf(answer))).toStrictEqual(["InvalidParams", undefined]);
});

test("[REL-29] an opId belongs to its caller: another caller's request with it is checked for access like any other", async () => {
  const target = world();
  const asTeam = (subject: string, input: unknown): Promise<Answer> =>
    target.call({ tool: "types_publish", input, principal: { kind: "agent", subject } });
  const first = await asTeam("team", { opId: op(1), typeId: "deck", baseVersion: 0, title: "Deck", description: "", instructions: "", collections: {}, exports: {}, content: { html: "" } });
  const other = await asTeam("team/alice", { opId: op(1), typeId: "deck", baseVersion: 0, title: "Deck", description: "", instructions: "", collections: {}, exports: {}, content: { html: "" } });

  expect([first.kind, errorOf(other)]).toStrictEqual(["result", "Forbidden"]);
});

test("[HOST-4] a url of another origin names no page, even where it holds a pageId", async () => {
  const { target, url, openAs } = await withPage();
  const elsewhere = [url.replace("pages.test", "pages.fake"), url.replace(BASE_URL, ""), `x${url}`, url.replace(PAGE, PAGE.replace("4000", "4xyz"))];
  const answers = await Promise.all(elsewhere.map(openAs));

  expect(answers.map((answer) => errorOf(answer))).toStrictEqual(["NotFound", "NotFound", "NotFound", "NotFound"]);
  expect(target.logs.slice(1).map((record) => record.pageId)).toStrictEqual([undefined, undefined, undefined, undefined]);
  expect((await openAs(`${BASE_URL}${PAGE}`)).kind).toBe("result");
  expect(url).toBe(`${BASE_URL}${PAGE}/secret-2`);
});

test("[PAGES-15] deleting a page that never existed does not use up its pageId", async () => {
  const target = world();
  const deleted = await call(target, ["pages_delete", { opId: op(9), pageId: PAGE }]);
  const stored = await saved(target.storage);
  const answer = await call(target, published(0));

  expect(deleted).toStrictEqual({ kind: "result", result: {} });
  expect(stored).toStrictEqual([[expect.stringContaining(op(9)), expect.objectContaining({ result: {} })]]);
  expect(answer.kind).toBe("result");
});

test("[PAGES-6] pages_delete leaves nothing of the page but the record that it is gone", async () => {
  const target = world();
  await call(target, published(0)).then(() => call(target, published(1)));
  await call(target, ["pages_set_access", { opId: op(7), pageId: PAGE, access: "link-write" }]);
  await call(target, ["pages_delete", { opId: op(8), pageId: PAGE }]);

  expect(await saved(target.storage)).toStrictEqual([
    [`gone/${PAGE}`, {}],
    [expect.stringContaining(op(8)), expect.objectContaining({ result: {} })],
  ]);
});
