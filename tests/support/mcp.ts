import { createAgentServer } from "@agentpages/mcp";
import type { Agent, Store } from "@agentpages/server";
import { Client, InMemoryTransport, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { ALICE, type World } from "./store.ts";

const CLIENT = { name: "agent", version: "1.0.0" };

/** The Store of a world, as a transport is given it. */
const storeOf = (target: World): Store => ({
  capability: target.driver.capability,
  tools: target.tools,
  call: target.call,
  host: target.host,
  view: target.view,
  sweep: target.sweep,
});

interface Serving {
  target: World;
  /** The agent the client is. Alice, when the test names no other. */
  as?: Agent;
}

type Connect = (serving: Serving) => Promise<Client>;

/** A client of a legacy connection, which opens with `initialize`. */
const overSession: Connect = async ({ target, as = ALICE }) => {
  const [near, far] = InMemoryTransport.createLinkedPair();
  await createAgentServer(storeOf(target))(as).connect(far);
  const client = new Client(CLIENT);
  await client.connect(near);
  return client;
};

/** A client whose every request is served by a new server, as the stateless revision of MCP does. */
const perRequest: Connect = async ({ target, as = ALICE }) => {
  const serve = createAgentServer(storeOf(target));
  const handler = createMcpHandler(() => serve(as));
  const transport = new StreamableHTTPClientTransport(new URL("https://mcp.test/"), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  const client = new Client(CLIENT, { versionNegotiation: { mode: "auto" } });
  await client.connect(transport);
  return client;
};

/** The revisions of MCP a server is reached over, each with the SDK's own client and no socket. */
export const REVISIONS: [string, Connect][] = [
  ["2025-11-25", overSession],
  ["2026-07-28", perRequest],
];
