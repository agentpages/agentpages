import { type Answer, ID_PATTERN, METHOD_SCHEMAS, TOOL_SCHEMAS } from "@agentpages/protocol";
import { expect, test } from "vitest";
import { ACTOR_KEY, ask, BASE_URL, COMMIT, committing, open, PAGE, resultOf, sharedPage, uuid, viewerId, world, type World } from "./support/store.ts";

const IDENTITY = "agentpages/identity/get";

/** The id `identity/get` gives a viewer who holds `url`. */
const shownTo = async (target: World, viewer: { url: string; subject: string }): Promise<string | undefined> =>
  resultOf(METHOD_SCHEMAS[IDENTITY].result, await ask(target, { ...viewer, method: IDENTITY, params: {} })).viewer?.id;

/** Keys of 32 bytes, of the 64 bytes of a block of SHA-256, of more, and of 32 bytes in half as many characters. */
const KEYS = [ACTOR_KEY, "k".repeat(64), "k".repeat(65), "é".repeat(16)];

const SUBJECTS = ["bob", "carol@example.com", "", "é/ü", "team/alice", "dave", "erin", "frank"];

test.each(KEYS)("[IDENT-5] the id of a viewer is the HMAC-SHA-256 of the page and the subject under the key of the Store, as base64url: %s", async (key) => {
  const { target, url } = await sharedPage({ config: { actorKey: key } });
  const shown = await Promise.all(SUBJECTS.map((subject) => shownTo(target, { url, subject })));
  const made = await ask(target, { url, subject: "bob", method: COMMIT, params: committing(3, []) });

  expect(shown).toStrictEqual(SUBJECTS.map((subject) => viewerId({ subject, pageId: PAGE, key })));
  expect(resultOf(TOOL_SCHEMAS.state_commit.result, made).commit.by).toStrictEqual({ kind: "viewer", id: shown[0] });
  expect(target.logs.at(-1)?.actor).toStrictEqual({ kind: "viewer", id: shown[0] });
  expect(shown.filter((id) => !ID_PATTERN.test(String(id)))).toStrictEqual([]);
  expect(["-", "_"].filter((own) => shown.join("").includes(own))).toStrictEqual(["-", "_"]);
});

test("[IDENT-5] a Store with another key gives the same viewer of the same page another id, and a Store restarted with its key the same id", async () => {
  const { target, url } = await sharedPage();
  const bob = { url, subject: "bob" };
  const before = await shownTo(target, bob);
  target.restart();
  const other = world({ ports: { storage: target.storage }, config: { actorKey: "another key of thirty-two bytes!!" } });

  expect([await shownTo(target, bob), await shownTo(other, bob)]).toStrictEqual([before, viewerId({ subject: "bob", pageId: PAGE, key: "another key of thirty-two bytes!!" })]);
  expect(await shownTo(other, bob)).not.toBe(before);
});

test("the log record of a viewer's request names them by their id on the page the request names, even where no such page exists", async () => {
  const { target, url } = await sharedPage();
  const opening = (link: string): Promise<Answer> => open(target, { url: link, subject: "bob" });
  await opening(url).then(() => opening(`${BASE_URL}${uuid(7)}/secret`)).then(() => opening("https://elsewhere.test/p/1"));
  await target.host({ operation: "pages_open", input: { url: 7 }, principal: { kind: "viewer", subject: "bob" }, requestId: "host-request" });

  expect(target.logs.slice(2).map((record) => [record.pageId, record.outcome, record.actor])).toStrictEqual([
    [PAGE, "ok", { kind: "viewer", id: viewerId({ subject: "bob", pageId: PAGE }) }],
    [uuid(7), "error", { kind: "viewer", id: viewerId({ subject: "bob", pageId: uuid(7) }) }],
    [undefined, "error", { kind: "viewer", id: viewerId({ subject: "bob" }) }],
    [undefined, "error", { kind: "viewer", id: viewerId({ subject: "bob" }) }],
  ]);
  expect(new Set(target.logs.slice(2).map((record) => JSON.stringify(record.actor))).size).toBe(3);
});

test("a Store is not created with an actorKey of less than 32 bytes", () => {
  const short = new RangeError("actorKey must be at least 32 bytes.");

  expect(() => world({ config: { actorKey: "k".repeat(31) } })).toThrow(short);
  expect(() => world({ config: { actorKey: `${"é".repeat(15)}k` } })).toThrow(short);
  expect(() => world({ config: { actorKey: "" } })).toThrow(short);
  expect(world({ config: { actorKey: "k".repeat(32) } }).tools).toContain("pages_publish");
});
