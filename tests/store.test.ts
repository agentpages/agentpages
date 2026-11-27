import { storeSuite } from "@agentpages/conformance";
import { afterAll, describe, expect, test } from "vitest";
import { sqliteFiles } from "./support/sqlite.ts";
import { ADVERTISED, world } from "./support/store.ts";
import { titlesBeside } from "./support/suites.ts";

/** What the suite proves of every Store, by the requirement of the spec each test proves. */
const CORE = [
  "[COMMON-4] a list without a limit returns 100 items, and nextCursor exactly when more exist",
  "[COMMON-4] every list returns its items in pages of the limit it was given",
  "[COMMON-4] a cursor with a character that is not printable ASCII is malformed",
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
  "[PAGES-6] pages_delete removes the page with its versions",
  "[PAGES-15] pages_delete of a page that does not exist succeeds",
  "[PAGES-17] html larger than maxHtmlBytes, in UTF-8 bytes, is beyond the limit",
  "[PAGES-18] a deleted pageId is never used again",
  "[PAGES-21] a page keeps its kind, and its typeId if it has one, in every version",
  "[COMMON-5] a change of kind is decided after what the request names and the limits, and before a conflict",
  "[PAGES-20] updatedAt changes when a version is published or the access changes, and at no other time",
  "[HOST-1] pages_open returns the page and what the host renders",
  "[HOST-3] the view is the page's own html, or that of its type version, with the type",
  "[HOST-4] a url that names no page is not found, and one that is not current opens only for the owner",
  "[REL-25] a failure of a host operation carries the requestId its host chose",
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
  "[TYPES-12] a change of what is a tree is malformed, even when the baseVersion is stale",
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
  "[REL-30] a repeat with the same params gets its first result, and an opId used again with other params is decided after the limits",
  "[REL-31] a request that failed is not remembered",
];

/** What it proves of a Store that advertises `state`. */
const STATE = [
  "[STATE-1] get returns the document, or null where there is none",
  "[STATE-2] list returns the documents of a collection, and the seq of the log",
  "[STATE-3] commit applies its ops and returns the commit",
  "[STATE-4] commits returns the commits after since, and the current seq",
  "[STATE-18] list orders by id, ascending by code point, and its seq is the position of the log",
  "[STATE-19] commits returns up to limit commits after since, in order, and a since beyond the seq is malformed",
  "[COMMON-4] list and commits without a limit return 100 items",
  "[STATE-20] a commit is kept while it is at most commitRetentionSeconds old, and a since before one that is no longer kept must resync",
  "[COMMON-9] a state request whose values break a rule of section 2.1 is malformed",
  "[STATE-9] commit applies all of its ops or none of them",
  "[STATE-11] a put replaces the whole document",
  "[STATE-12] a delete of a missing document changes nothing and produces no Change",
  "[STATE-13] a commit whose ops change nothing still succeeds and takes a seq",
  "[STATE-23] the ops of a commit apply in the order given",
  "[STATE-14] a commit with more than maxOpsPerCommit ops, or with two ops on one document, is malformed",
  "[STATE-15] data larger than maxDocumentBytes, as UTF-8 JSON without whitespace, is beyond the limit",
  "[STATE-16] a revision counter starts at 0, counts every put and every delete of a document, and never resets",
  "[STATE-17] an op with ifRevision succeeds only if the counter equals it, and 0 asks that the document does not exist",
  "[REL-2] a commit repeated with its opId is applied once and gets the first commit again",
  "[REL-3] the opId of a commit used again with other params is malformed",
  "[REL-30] a repeated commit gets its first commit, and an opId used again with other ops is decided after the limits",
  "[REL-31] a commit that failed is not remembered",
  "[STATE-5] page scope documents are shared by every viewer of the page, and with its agent",
  "[STATE-6] viewer scope documents are private to their viewer",
  "[STATE-7] viewer scope with an anonymous viewer is unauthenticated",
  "[STATE-8] by and updatedBy name who made the change",
  "[STATE-10] the page scope and each viewer's scope have a log of their own, numbered from 1 without gaps",
  "[TOOLS-1] each state method is a tool with the same params plus pageId, and the same result",
  "[TOOLS-2] a tool call with viewer scope is forbidden",
  "[COMMON-5] a state request is checked in the order of section 2.1",
  "[STATE-10] random commits and reads in the page scope, which has a tree, and the scopes of two viewers agree with a model of three logs",
  "[TYPES-9] on a typed page, a put into a collection the type does not declare, or of data that does not match its schema, is malformed",
  "[TYPES-9] the type version that checks a commit is the one the page names when the commit arrives",
  "[TYPES-11] documents already stored are not checked again when a page moves to another type version",
  "[COMMON-5] what the type of a page does not allow is decided after the limits and before a conflict",
  "[TYPES-9] the viewer scope of a typed page holds whatever its viewer puts there",
  "[TREE-1] the documents with parent null are roots, and a parent is a document of the same collection",
  "[TREE-2] in a tree, an index that does not match the pattern is malformed",
  "[TREE-4] a commit that would leave a tree document it puts with a missing parent, or one it places as its own ancestor, is a conflict",
  "[TREE-4] a put places its document when it creates it or changes its parent: one that keeps its parent is not its own ancestor, and misses a parent the commit deletes",
  "[TREE-5] deleting a tree document also deletes all its descendants in the same commit, each as a Change",
  "[TREE-5] a document the commit moves out of a deleted document stays, and one it puts under a deleted document has a missing parent",
  "[TREE-6] the tree rules are checked once, after all the ops of a commit",
  "[TREE-7] changes are in op order: a delete is followed by its descendants, depth first, a parent before its children, siblings by id",
  "[TREE-7] a descendant the commit has its own op on keeps the place of that op",
  "[TREE-1] the tree rules hold in the page scope: a viewer's own scope holds whatever its viewer puts there",
  "[COMMON-5] what is no tree node is decided after the limits and before the limits of a tree, and a broken tree after the conditions of the ops",
  "[TREE-6] the limit on changes is decided before the limit on depth, a condition of an op before a broken tree, and the first op in order decides",
  "[TREE-8] a commit whose changes, descendants included, number more than maxOpsPerCommit is beyond the limit",
  "[TREE-9] a commit that would leave a tree document it places with more than maxTreeDepth ancestors is beyond the limit",
  "[TREE-9] other documents are not checked: the descendants of a moved document can be deeper, and so can a put that keeps its parent",
  "[TREE-9] a document placed as its own ancestor with more than maxTreeDepth documents between is beyond the limit, and with fewer a conflict",
  "[TYPES-12] a type version that leaves a tree out does not change it: its documents stay a tree",
  "[STATE-1] reading the page scope needs read access: the owner as a viewer has it, and a link holder with either link setting",
  "[STATE-3] a commit to the page scope needs write access: the owner as a viewer has it, and a link holder with link-write",
  "[ACCESS-6] a signed-in viewer with read access reads and writes their own viewer scope",
  "[REL-29] the opId of a commit belongs to its viewer and its page, and all anonymous viewers of a page are one caller",
  "[REL-30] a repeated commit is recognised only while its page exists and its caller has access",
];

/** What it proves of a Store that advertises `identity`. */
const IDENTITY = [
  "[IDENT-1] identity/get returns the viewer: an id, and a name when they have one",
  "[IDENT-1] identity/get answers whoever can read the page, and nobody else",
  "[IDENT-2] the viewer is null for an anonymous viewer",
  "[IDENT-3] the id is the same for the same person on the same page for as long as the page exists, and another on another page",
];

/** What it proves of a Store that advertises both. */
const IDENTITY_IN_STATE = [
  "[IDENT-3] the id is the id of the viewer's Actor in commits",
];

/** What it proves of a Store that does not advertise `state`. */
const WITHOUT_STATE = [
  "[EXT-3] a Store without state answers every tool that requires state as a tool it does not know, and the others as ever",
  "[EXT-3] a Store without state answers every state method of a view as a method it does not know",
];

/** What it proves of a Store that does not advertise `identity`. */
const WITHOUT_IDENTITY = [
  "[EXT-3] a Store without identity answers every identity method of a view as a method it does not know",
];

const { limits, state, identity } = ADVERTISED;

interface Kind {
  /** What the Store advertises beside its limits. */
  features: object;
  titles: string[];
}

const KINDS: Record<string, Kind> = {
  "state and identity": { features: { state, identity }, titles: [...CORE, ...STATE, ...IDENTITY, ...IDENTITY_IN_STATE] },
  "neither state nor identity": { features: {}, titles: [...CORE, ...WITHOUT_STATE, ...WITHOUT_IDENTITY] },
  "state and no identity": { features: { state }, titles: [...CORE, ...STATE, ...WITHOUT_IDENTITY] },
  "identity and no state": { features: { identity }, titles: [...CORE, ...WITHOUT_STATE, ...IDENTITY] },
};

describe.each(Object.entries(KINDS))("a Store over the memory storage, with %s", (_, { features, titles }) => {
  storeSuite(() => world({ config: { capability: { limits, ...features } } }).driver);

  test("the suite registered every test of such a Store", ({ task }) => {
    expect(titlesBeside(task)).toStrictEqual(titles);
  });
});

const files = sqliteFiles();

afterAll(files.remove);

describe("a Store over the SQLite storage, with state and identity", { timeout: 60_000 }, () => {
  storeSuite(() => world({ ports: { storage: files.open({ path: files.path() }) } }).driver);

  test("the suite registered every test of such a Store", ({ task }) => {
    expect(titlesBeside(task)).toStrictEqual([...CORE, ...STATE, ...IDENTITY, ...IDENTITY_IN_STATE]);
  });
});
