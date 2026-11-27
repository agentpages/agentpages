import {
  BODY_PATTERN,
  CapabilitySchema,
  DEFAULT_LIMIT,
  DESCRIPTION_PATTERN,
  DOC_ATTRIBUTE,
  ERROR_NAMES,
  ERRORS,
  EXTENSION_ID,
  type Feature,
  FEATURES,
  HOST_OPERATION_SCHEMAS,
  HOST_OPERATIONS,
  ID_PATTERN,
  isBase64,
  MAX_ATTEMPTS,
  MAX_COUNT,
  MAX_DIAGNOSTICS,
  MAX_LIMIT,
  METHOD_NOT_FOUND,
  METHOD_PREFIX,
  METHOD_SCHEMAS,
  METHODS,
  NAME_PATTERN,
  NOTIFICATION_SCHEMAS,
  NOTIFICATIONS,
  PAGE_RESOURCE_MIME_TYPE,
  pageResourceUri,
  PDF_FORMAT,
  PROTOCOL_VERSION,
  RETRY_BASE_MS,
  SETTLE_QUIET_MS,
  TIMESTAMP_PATTERN,
  TOOL_SCHEMAS,
  TOOL_VISIBILITY,
  TOOLS,
  TREE_INDEX_PATTERN,
  UUID_PATTERN,
} from "@agentpages/protocol";
import { expect, test } from "vitest";
import { advertised, capabilityExample, errorRows, type Exchange, hostRows, methodRows, numberIn, spec, textIn, toolRows } from "./support/spec.ts";
import { methodToolRows, notificationExample, verdict } from "./support/subjects.ts";

const allTools: Exchange[] = [...toolRows, ...methodToolRows];

/** The feature a method or a tool is named after, if any: `agentpages/<feature>/…` and `<feature>_…`. */
const featureOf = (group = ""): Feature[] => FEATURES.filter((feature) => feature === group);

const destinationOf = (row: Exchange): string => (row.section.includes("Requests to the view") ? "view" : "host");

/** What the spec says of a method: its feature by its group, its direction by its section, and its `opId`. */
const methodsOfSpec: [string, unknown][] = methodRows.map((row) => [
  row.name,
  { feature: featureOf(row.name.split("/")[1])[0] ?? null, to: destinationOf(row), mutates: row.params.includes("opId") },
]);

/** Section 5.5: `pages_render` needs `render`, and `pages_export` needs `render` and `files`. */
const RENDERING: Record<string, Feature[]> = { pages_render: ["render"], pages_export: ["render", "files"] };

const toolsOfSpec: [string, unknown][] = allTools.map((row) => [
  row.name,
  { requires: RENDERING[row.name] ?? featureOf(row.name.split("_")[0]), mutates: row.params.includes("opId") },
]);

test("the spec is the version the package implements", () => {
  expect(spec).toContain(`Version ${PROTOCOL_VERSION} `);
});

test("the spec advertises the package's extension, version and features", () => {
  const features = Object.fromEntries(FEATURES.map((feature) => [feature, expect.any(Object) as unknown]));

  expect(advertised).toStrictEqual({
    [EXTENSION_ID]: { version: PROTOCOL_VERSION, limits: expect.any(Object) as unknown, ...features },
  });
});

test("the spec's example capability is one", () => {
  expect(verdict(CapabilitySchema, capabilityExample)).toBe(true);
});

test("the registry has exactly the methods of the spec's tables, each with a tag", () => {
  expect(Object.entries(METHODS)).toStrictEqual(methodsOfSpec);
  expect(Object.keys(METHOD_SCHEMAS)).toStrictEqual(Object.keys(METHODS));
  expect(Object.keys(METHODS).filter((name) => !name.startsWith(METHOD_PREFIX))).toStrictEqual([]);
  expect(new Set(methodRows.map((row) => row.tag)).size).toBe(methodRows.length);
});

test("the registry has exactly the notification of the spec's example", () => {
  expect(Object.keys(NOTIFICATIONS)).toStrictEqual(notificationExample);
  expect(Object.keys(NOTIFICATION_SCHEMAS)).toStrictEqual(notificationExample);
  expect(NOTIFICATIONS["agentpages/state/committed"]).toStrictEqual({ feature: "state", to: "view" });
});

test("the registry has exactly the tools of the spec's tables and of its state and files methods", () => {
  expect(new Map(Object.entries(TOOLS))).toStrictEqual(new Map(toolsOfSpec));
  expect(new Set(Object.keys(TOOL_SCHEMAS))).toStrictEqual(new Set(Object.keys(TOOLS)));
  expect(new Set(toolRows.map((row) => row.tag)).size).toBe(toolRows.length);
});

const HOST_SECTIONS = ["5.6 Host operations", "5.6 Host operations", "5.6 Host operations"];
const COMMENTS_SECTIONS = ["5.4 Comments", "5.4 Comments", "5.4 Comments"];

test("the registry has exactly the host operations of the spec, and only its comments tools are among them", () => {
  const operationsOfSpec = hostRows.map((row) => [row.name, { mutates: row.params.includes("opId") }]);

  const commentsTools = ["comments_list", "comments_reply", "comments_resolve"];

  expect(hostRows.map((row) => row.section)).toStrictEqual([...HOST_SECTIONS, ...COMMENTS_SECTIONS]);
  expect(spec).toContain("with `url` in place of `pageId`");
  expect(Object.entries(HOST_OPERATIONS)).toStrictEqual(operationsOfSpec);
  expect(Object.keys(HOST_OPERATION_SCHEMAS)).toStrictEqual(Object.keys(HOST_OPERATIONS));
  expect(Object.keys(HOST_OPERATIONS).filter((name) => name in TOOLS)).toStrictEqual(commentsTools);
  expect(spec).toContain("They are not MCP tools");
});

test("the errors are exactly the rows of the spec's table", () => {
  const rows = ERROR_NAMES.map((name) => ({ name, ...ERRORS[name], meaning: expect.any(String) as unknown }));

  expect(errorRows).toStrictEqual(rows);
  expect(Object.keys(ERRORS)).toStrictEqual([...ERROR_NAMES]);
  expect(spec).toContain(`JSON-RPC error \`${METHOD_NOT_FOUND}\``);
});

test("the constants are the ones the spec states", () => {
  const resource = /MCP resource at `([^`]+)`/u.exec(spec)?.[1];

  expect(spec).toContain(`use the prefix \`${METHOD_PREFIX}\``);
  expect(spec).toContain(`\`${DOC_ATTRIBUTE}="<collection>/<id>"\``);
  expect(spec).toContain(`With \`format: "${PDF_FORMAT}"\``);
  expect(spec).toContain(`MIME type \`${PAGE_RESOURCE_MIME_TYPE}\``);
  expect(pageResourceUri({ pageId: "{pageId}", version: 7 })).toBe(resource?.replace("{version}", "7"));
  expect(spec).toContain(`\`_meta.ui.visibility: ${JSON.stringify(TOOL_VISIBILITY)}\``);
});

test("the numbers are the ones the spec states", () => {
  expect(MAX_DIAGNOSTICS).toBe(numberIn(/At most (\d+) diagnostics/u));
  expect(SETTLE_QUIET_MS).toBe(numberIn(/pending for (\d+) milliseconds/u));
  expect(RETRY_BASE_MS).toBe(numberIn(/between 0 and `(\d+) × 2ⁿ` milliseconds/u));
  expect(MAX_ATTEMPTS).toBe(numberIn(/stops after (\d+) attempts/u));
  expect(MAX_LIMIT).toBe(numberIn(/Every `limit` is 1 to (\d+)/u));
  expect(DEFAULT_LIMIT).toBe(numberIn(/and defaults to (\d+)\./u));
  expect(MAX_COUNT).toBe(2 ** numberIn(/is an integer from 0 to 2\^(\d+) − 1/u) - 1);
});

test("the patterns are the ones the spec writes out", () => {
  expect(spec).toContain(`match \`${ID_PATTERN.source}\`. \`[COMMON-1]\``);
  expect(spec).toContain(`\`index\` matches \`${TREE_INDEX_PATTERN.source}\``);
});

test("the patterns hold the numbers and the layouts the spec states", () => {
  const uuid = textIn(/in lowercase as `([\d-]+)` hexadecimal digits/u).split("-");
  const timestamp = textIn(/written as `(YYYY[^`]+)`/u).replaceAll(/[YMDHms]/gu, "1");

  expect(NAME_PATTERN.source).toContain(`{1,${numberIn(/`mimeType` are 1 to (\d+) characters/u)}}`);
  expect(DESCRIPTION_PATTERN.source).toContain(`{0,${numberIn(/`quote` are at most (\d+)\./u)}}`);
  expect(BODY_PATTERN.source).toContain(`{0,${numberIn(/`instructions` are at most (\d+)\./u)}}`);
  expect(UUID_PATTERN.source).toBe(`^${uuid.map((size) => `[0-9a-f]{${size}}`).join("-")}$`);
  expect(timestamp).toMatch(TIMESTAMP_PATTERN);
  expect(timestamp).toHaveLength(24);
});

test("the spec still words the rules the patterns encode", () => {
  expect(spec).toContain("UUIDs chosen by the caller, written in lowercase");
  expect(spec).toContain("Timestamps are real UTC dates and times");
  expect(spec).toContain("A character is a Unicode code point.");
  expect(spec).toContain("standard alphabet with padding (RFC 4648, section 4), in canonical form: unused bits are zero.");
  expect(isBase64("AA==")).toBe(true);
  expect(isBase64("AB==")).toBe(false);
  expect(textIn(/as in section 2\.1, other than `(\w+)`/u)).toBe(PDF_FORMAT);
});
