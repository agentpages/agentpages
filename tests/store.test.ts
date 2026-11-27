import { storeSuite } from "@agentpages/conformance";
import { describe, expect, test } from "vitest";
import { titlesBeside, world } from "./support/store.ts";

/** What the suite proves of a Store, by the requirement of the spec each test proves. */
const TITLES = [
  "[COMMON-4] a list without a limit returns 100 items, and nextCursor exactly when more exist",
  "[COMMON-4] every list returns its items in pages of the limit it was given",
  "[COMMON-5] a malformed request is malformed, whatever else is wrong with it",
  "[COMMON-5] what a request names is looked for before the caller's access",
  "[COMMON-5] the caller's access is checked before the limits, and what a request names before both",
  "[COMMON-9] a value that breaks a rule of section 2.1 is malformed",
  "[EXT-1] the Store advertises the capability object of section 3",
  "[ACCESS-1] the owner does everything through the tools, whatever the access",
  "[ACCESS-2] any other MCP principal is refused, whatever the access",
  "[ACCESS-8] a link holder presents the current url, which ends when the page becomes private",
  "[PAGES-1] pages_publish creates a page and returns its PageInfo",
  "[PAGES-2] pages_get returns the PageInfo and exactly the content that was published",
  "[PAGES-3] pages_list returns the PageInfo of each of the caller's pages",
  "[PAGES-4] pages_versions returns each version with the time it was published",
  "[PAGES-5] pages_set_access changes who can open the page and returns its PageInfo",
  "[PAGES-6] pages_delete returns an empty object",
  "[PAGES-7] pages_publish succeeds only from the current version, and creates the next one",
  "[PAGES-8] a published version never changes",
  "[PAGES-9] csp and permissions belong to a version",
  "[PAGES-10] a new page is private",
  "[PAGES-11] pages_get without a version returns the current one",
  "[PAGES-12] pages_list returns only the caller's pages, most recently updated first",
  "[PAGES-13] pages_versions orders by version, ascending",
  "[PAGES-14] pages_delete removes the page with its versions",
  "[PAGES-15] pages_delete of a page that does not exist succeeds",
  "[PAGES-17] html larger than maxHtmlBytes, in UTF-8 bytes, is beyond the limit",
  "[PAGES-18] a deleted pageId is never used again",
  "[PAGES-20] updatedAt changes when a version is published or the access changes, and at no other time",
  "[HOST-1] pages_open returns the page and what the host renders",
  "[HOST-3] the view is the page's own html, or that of its type version, with the type",
  "[HOST-4] a url that names no page is not found, and one that is not current opens only for the owner",
  "[TYPES-1] types_publish creates a type and returns its TypeInfo",
  "[TYPES-2] types_get returns the TypeInfo and exactly the content that was published",
  "[TYPES-3] types_list returns the TypeInfo of the current version of every type",
  "[TYPES-4] types_publish succeeds only from the current version, and a published version never changes",
  "[TYPES-5] only its owner publishes a version of a type, and every MCP principal reads it and publishes pages of it",
  "[TYPES-6] types_list orders by typeId, ascending by code point",
  "[TYPES-7] a typed page renders the html, csp and permissions of its type version",
  "[TYPES-8] pages_publish with a type or a type version that does not exist is not found",
  "[TYPES-10] a page moves to a newer type version only when a version of the page names it",
  "[TYPES-12] a collection is a tree in every version of a type or in none",
  "[TYPES-13] a key of exports is an id other than pdf",
  "[TYPES-14] a schema that is not valid JSON Schema 2020-12, or refers to anything outside itself, is malformed",
  "[TYPES-15] a schema larger than maxSchemaBytes, as UTF-8 JSON without whitespace, is beyond the limit",
  "[STORE-5] every tool that changes anything takes an opId",
  "[REL-1] a request that changes something carries an opId, and one that only reads carries none",
  "[REL-2] a request repeated with its opId is applied once and gets the first result again",
  "[REL-2] copies of a request that arrive together are applied once and get one result",
  "[REL-3] an opId used again with other params is malformed",
  "[REL-4] an opId is remembered for at least opRetentionSeconds",
  "[REL-8] a request the Store refuses changes nothing",
  "[REL-30] a repeated opId is recognised only once its page is found",
  "[REL-31] a request that failed is not remembered",
];

describe("a Store over the memory storage", () => {
  storeSuite(() => world().driver);

  test("the suite registered every test of a Store", ({ task }) => {
    expect(titlesBeside(task)).toStrictEqual(TITLES);
  });
});
