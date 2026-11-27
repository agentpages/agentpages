import { type Need, permits, type Principal } from "@agentpages/server";
import { expect, test } from "vitest";

const URL = "https://pages.test/p/1/current";

const ACCESSES = ["private", "link-read", "link-write"] as const;

const NEEDS: Need[] = ["read", "write", "owner"];

/** Who asks, and the page link they present. */
interface Asking {
  principal: Principal;
  link?: string;
}

/** What is permitted under each access setting, as the needs that are granted. */
const grantedTo = (asking: Asking): Need[][] =>
  ACCESSES.map((access) => NEEDS.filter((need) => permits({ ...asking, page: { owner: "alice", access, url: URL }, need })));

const ALICE = { kind: "viewer", subject: "alice" } as const;
const BOB = { kind: "viewer", subject: "bob" } as const;
const NOBODY = { kind: "anonymous" } as const;

test("[ACCESS-1] the owner does everything through the Store tools, whatever the access", () => {
  expect(grantedTo({ principal: { kind: "agent", subject: "alice" } })).toStrictEqual([NEEDS, NEEDS, NEEDS]);
});

test("[ACCESS-2] any other MCP principal does nothing, whatever the access", () => {
  expect(grantedTo({ principal: { kind: "agent", subject: "bob" } })).toStrictEqual([[], [], []]);
  expect(grantedTo({ principal: { kind: "agent", subject: "" } })).toStrictEqual([[], [], []]);
  expect(grantedTo({ principal: { kind: "agent", subject: "bob" }, link: URL })).toStrictEqual([[], [], []]);
});

test("the owner, as a viewer, reads and writes whatever the access and the link", () => {
  const both = [["read", "write"], ["read", "write"], ["read", "write"]];

  expect(grantedTo({ principal: ALICE })).toStrictEqual(both);
  expect(grantedTo({ principal: ALICE, link: "https://pages.test/p/1/old" })).toStrictEqual(both);
});

test.each<Principal>([BOB, NOBODY])(
  "a link holder does nothing on a private page, reads with link-read, and reads and writes with link-write: $kind",
  (principal) => {
    expect(grantedTo({ principal, link: URL })).toStrictEqual([[], ["read"], ["read", "write"]]);
  },
);

test.each<Asking>([
  { principal: BOB },
  { principal: BOB, link: "https://pages.test/p/1/old" },
  { principal: NOBODY },
  { principal: NOBODY, link: `${URL}x` },
])("a viewer who does not present the current url does nothing: %o", (stranger) => {
  expect(grantedTo(stranger)).toStrictEqual([[], [], []]);
});
