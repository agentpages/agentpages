import { type Need, permits, type Principal } from "@agentpages/server";
import { expect, test } from "vitest";

const URL = "https://pages.test/p/1/current";

const ACCESSES = ["private", "link-read", "link-write"] as const;

const NEEDS: Need[] = ["read", "write", "owner"];

/** What `principal` may do under each access setting, as the needs that are permitted. */
const grantedTo = (principal: Principal): Need[][] =>
  ACCESSES.map((access) => NEEDS.filter((need) => permits({ principal, page: { owner: "alice", access, url: URL }, need })));

test("[ACCESS-1] the owner does everything through the Store tools, whatever the access", () => {
  expect(grantedTo({ kind: "agent", subject: "alice" })).toStrictEqual([NEEDS, NEEDS, NEEDS]);
});

test("[ACCESS-2] any other MCP principal does nothing, whatever the access", () => {
  expect(grantedTo({ kind: "agent", subject: "bob" })).toStrictEqual([[], [], []]);
  expect(grantedTo({ kind: "agent", subject: "" })).toStrictEqual([[], [], []]);
});

test("the owner, as a viewer, reads and writes whatever the access and the link", () => {
  const both = [["read", "write"], ["read", "write"], ["read", "write"]];

  expect(grantedTo({ kind: "viewer", subject: "alice" })).toStrictEqual(both);
  expect(grantedTo({ kind: "viewer", subject: "alice", url: "https://pages.test/p/1/old" })).toStrictEqual(both);
});

test.each<Principal>([{ kind: "viewer", subject: "bob", url: URL }, { kind: "anonymous", url: URL }])(
  "a link holder does nothing on a private page, reads with link-read, and reads and writes with link-write: $kind",
  (holder) => {
    expect(grantedTo(holder)).toStrictEqual([[], ["read"], ["read", "write"]]);
  },
);

test.each<Principal>([
  { kind: "viewer", subject: "bob" },
  { kind: "viewer", subject: "bob", url: "https://pages.test/p/1/old" },
  { kind: "anonymous" },
  { kind: "anonymous", url: `${URL}x` },
])("a viewer without the current url does nothing: %o", (stranger) => {
  expect(grantedTo(stranger)).toStrictEqual([[], [], []]);
});
