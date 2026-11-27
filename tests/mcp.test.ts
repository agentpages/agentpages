import {
  EXTENSION_ID,
  PAGE_RESOURCE_MIME_TYPE,
  pageResourceUri,
  TOOL_DESCRIPTIONS,
  TOOL_SCHEMAS,
  toolInputSchema,
  validate,
} from "@agentpages/protocol";
import type { Client } from "@modelcontextprotocol/client";
import { expect, test } from "vitest";
import { REVISIONS } from "./support/mcp.ts";
import { ADVERTISED, BOB, committed, HTML, PAGE, PUBLISHED, publishing, put, TYPED_PAGE, uuid, world } from "./support/store.ts";

const { limits } = ADVERTISED;

/** What a value is once it has crossed a wire. */
const wired = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

const fields = (input: unknown): Record<string, unknown> => ({ ...(typeof input === "object" ? input : {}) });

const calling = (client: Client, [name, input]: [string, unknown]): ReturnType<Client["callTool"]> =>
  client.callTool({ name, arguments: fields(input) });

/** What a request was refused with: the code, message and data of its JSON-RPC error. */
const refusal = (request: Promise<unknown>): Promise<unknown> =>
  request.then(
    () => "answered",
    ({ code, message, data }: { code: unknown; message: unknown; data: unknown }) => ({ code, message, data }),
  );

test.each(REVISIONS)("[EXT-1] the server advertises the capability of its Store under the extension identifier, over MCP %s", async (revision, connect) => {
  const target = world();
  const client = await connect({ target });

  expect(client.getNegotiatedProtocolVersion()).toBe(revision);
  expect(client.getServerCapabilities()).toStrictEqual({ tools: { listChanged: false }, resources: { listChanged: false }, extensions: { [EXTENSION_ID]: target.driver.capability } });
  expect(client.getServerVersion()).toMatchObject({ name: "agentpages", version: "0.1" });
});

test.each(REVISIONS)("[STORE-1] [STORE-4] every tool is listed for the model alone, with its description and input schema and no output schema, over MCP %s", async (_, connect) => {
  const target = world();
  const { tools } = await (await connect({ target })).listTools();

  expect(tools.map((tool) => tool.name)).toStrictEqual(target.tools);
  expect(tools).toStrictEqual(
    target.tools.map((name) => ({
      name,
      description: TOOL_DESCRIPTIONS[name],
      inputSchema: wired(toolInputSchema(name)),
      _meta: { ui: { visibility: ["model"] } },
    })),
  );
  expect(tools.filter((tool) => "outputSchema" in tool)).toStrictEqual([]);
});

test.each(REVISIONS)("[TOOLS-3] the tools of a feature the Store does not advertise are not listed and are unknown tools, over MCP %s", async (_, connect) => {
  const target = world({ config: { capability: { limits } } });
  const client = await connect({ target });
  const { tools } = await client.listTools();

  expect(tools.map((tool) => tool.name)).toStrictEqual(target.tools);
  expect(target.tools).not.toContain("state_get");
  await expect(refusal(calling(client, ["state_get", { pageId: PAGE, scope: "page", collection: "tasks", id: "a" }]))).resolves.toStrictEqual({
    code: -32_602,
    message: "Unknown tool: state_get",
    data: undefined,
  });
});

test.each(REVISIONS)("[STORE-2] a tool returns its output as structuredContent and the same JSON as one text block, over MCP %s", async (_, connect) => {
  const client = await connect({ target: world() });
  const published = await calling(client, PUBLISHED);
  const page = validate(TOOL_SCHEMAS.pages_publish.result, published.structuredContent);

  expect(page).toMatchObject({ ok: true, value: { pageId: PAGE, version: 1, access: "private" } });
  expect(published).toMatchObject({ content: [{ type: "text", text: JSON.stringify(published.structuredContent) }] });
  expect(published.content).toHaveLength(1);
  expect(published.isError).toBeUndefined();
});

test.each(REVISIONS)("[STORE-3] a failure is a tool error with its name and data, and the same JSON as one text block, over MCP %s", async (_, connect) => {
  const client = await connect({ target: world() });
  const missing = await calling(client, ["pages_get", { pageId: PAGE }]);
  const malformed = await client.callTool({ name: "pages_get" });

  expect(missing.structuredContent).toStrictEqual({ error: "NotFound", requestId: "request-1", message: expect.any(String) as unknown, retryable: false });
  expect(missing).toMatchObject({ isError: true, content: [{ type: "text", text: JSON.stringify(missing.structuredContent) }] });
  expect(missing.content).toHaveLength(1);
  expect(malformed).toMatchObject({ isError: true, structuredContent: { error: "InvalidParams" } });
});

test.each(REVISIONS)("[ACCESS-2] a tool call is made as the agent the server was created for, over MCP %s", async (_, connect) => {
  const target = world();
  const [alice, bob] = [await connect({ target }), await connect({ target, as: BOB })];
  await calling(alice, PUBLISHED);
  const answers = [await calling(bob, ["pages_get", { pageId: PAGE }]), await calling(bob, ["pages_list", {}]), await calling(alice, ["pages_list", {}])];

  expect(answers.map((answer) => answer.structuredContent)).toMatchObject([{ error: "Forbidden" }, { pages: [] }, { pages: [{ pageId: PAGE }] }]);
});

test.each(REVISIONS)("[TOOLS-1] an agent publishes a page, fills its state and reads both back, over MCP %s", async (_, connect) => {
  const client = await connect({ target: world() });
  const written = [await calling(client, PUBLISHED), await calling(client, committed(2, [put("a", { title: "Plan" })]))];
  const page = await calling(client, ["pages_get", { pageId: PAGE }]);
  const document = await calling(client, ["state_get", { pageId: PAGE, scope: "page", collection: "tasks", id: "a" }]);

  expect(written.map((answer) => answer.isError)).toStrictEqual([undefined, undefined]);
  expect(page.structuredContent).toMatchObject({ pageId: PAGE, version: 1, title: "Page", content: { kind: "html", html: HTML } });
  expect(document.structuredContent).toMatchObject({ document: { id: "a", data: { title: "Plan" }, revision: 1, updatedBy: { kind: "agent" } } });
});

test.each(REVISIONS)("[REL-2] a call the agent cancels still completes, and its repeat gets the same result, over MCP %s", async (_, connect) => {
  const target = world();
  const client = await connect({ target });
  const cancelling = new AbortController();
  target.plan(() => {
    cancelling.abort();
  });
  const cancelled = await refusal(client.callTool({ name: "pages_publish", arguments: fields(PUBLISHED[1]) }, { signal: cancelling.signal }));
  const [repeated, again] = [await calling(client, PUBLISHED), await calling(client, PUBLISHED)];

  expect(cancelled).not.toBe("answered");
  expect(repeated.structuredContent).toMatchObject({ pageId: PAGE, version: 1 });
  expect(again.structuredContent).toStrictEqual(repeated.structuredContent);
  expect(target.logs.filter((record) => record.method === "pages_publish")).toHaveLength(3);
});

const SECURED = { csp: { resourceDomains: ["https://cdn.test"] }, permissions: { camera: {} } };

const html = (version: number): unknown => ({ ...publishing({ page: 1, baseVersion: version - 1, op: version }), content: { kind: "html", html: `<p>${version}</p>`, ...(version === 1 && SECURED) } });

test.each(REVISIONS)("[PAGES-16] each html version is a resource with its MIME type, and its csp and permissions under _meta.ui, over MCP %s", async (_, connect) => {
  const client = await connect({ target: world() });
  await calling(client, ["pages_publish", html(1)]);
  await calling(client, ["pages_publish", html(2)]);
  const uris = [1, 2].map((version) => pageResourceUri({ pageId: PAGE, version }));
  const read = await Promise.all(uris.map((uri) => client.readResource({ uri })));

  expect(uris).toStrictEqual([`ui://agentpages/${PAGE}/1`, `ui://agentpages/${PAGE}/2`]);
  expect(read.map((result) => wired(result.contents))).toStrictEqual([
    [{ uri: uris[0], mimeType: PAGE_RESOURCE_MIME_TYPE, text: "<p>1</p>", _meta: { ui: SECURED } }],
    [{ uri: uris[1], mimeType: PAGE_RESOURCE_MIME_TYPE, text: "<p>2</p>", _meta: { ui: {} } }],
  ]);
  await expect(client.listResourceTemplates()).resolves.toMatchObject({
    resourceTemplates: [{ name: "page", uriTemplate: "ui://agentpages/{pageId}/{version}", mimeType: "text/html;profile=mcp-app" }],
  });
  await expect(client.listResources()).resolves.toMatchObject({ resources: [] });
});

test.each(REVISIONS)("[PAGES-16] a version that is not html, is missing or is another agent's, and any other URI, is no resource, over MCP %s", async (_, connect) => {
  const target = world();
  const [alice, bob] = [await connect({ target }), await connect({ target, as: BOB })];
  await TYPED_PAGE.reduce<Promise<unknown>>((earlier, request) => earlier.then(() => calling(alice, request)), Promise.resolve());
  await calling(alice, ["pages_publish", publishing({ page: 2, baseVersion: 0, op: 3 })]);
  const mine = pageResourceUri({ pageId: uuid(2), version: 1 });
  const uris = [pageResourceUri({ pageId: PAGE, version: 1 }), pageResourceUri({ pageId: uuid(2), version: 2 }), `${mine}/more`, "file:///etc/hosts"];
  const refused = await Promise.all([...uris.map((uri) => refusal(alice.readResource({ uri }))), refusal(bob.readResource({ uri: mine }))]);

  expect(refused).toStrictEqual([...uris, mine].map((uri) => ({ code: -32_602, message: `Resource not found: ${uri}`, data: { uri } })));
  await expect(alice.readResource({ uri: mine })).resolves.toMatchObject({ contents: [{ uri: mine, text: HTML }] });
});
