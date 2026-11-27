# @agentpages/server

The Store of the [agentpages protocol](../../spec/agentpages.md): what it does, without a transport. `@agentpages/mcp` puts it behind MCP.

## Create a Store

```ts
import { ajvSchemaCompiler, createMemoryStorage, createStore, unlimited } from "@agentpages/server";

const store = createStore(
  { storage: createMemoryStorage(), clock, ids, logger, limiter: unlimited, compiler: ajvSchemaCompiler },
  { capability: { limits }, baseUrl: "https://pages.example/p/" },
);

const answer = await store.call({ tool: "pages_publish", input, principal: { kind: "agent", subject: "alice" } });
```

`call` answers a tool call of an agent, and `host` an operation a host runs for a viewer. An answer is a result, a failure of the spec, or `unknown-method` for a tool the Store does not have. `capability` is what the Store advertises, and `tools` the tools it lists. The Store keeps nothing in memory: all it knows is in the storage.

This package has the pages tools, the types tools and `pages_open`. State, files, comments and rendering are not built yet: their tools are listed, and answer `unknown-method`.

## Ports

A Store depends on six interfaces, and on nothing else outside the protocol.

| Port | What it gives the Store | Adapter here |
|---|---|---|
| `Storage` | An ordered key-value store with transactions that are serial per lock key | `createMemoryStorage` |
| `Clock` | The time | |
| `Ids` | Request ids, and the secret of a page's `url` | |
| `Logger` | Where log records go | |
| `RateLimiter` | Whether a request must wait | `unlimited` |
| `SchemaCompiler` | Whether a JSON Schema is valid, and whether data matches it | `ajvSchemaCompiler` |

Who makes a request is not a port but a value the transport passes: a `Principal`. Agents and viewers share one namespace of subjects. A viewer's `url` is the page link the viewer presented, which makes them a link holder when it is the page's current one.

A new database is a new `Storage`. Run `storageSuite` and `storeSuite` of [@agentpages/conformance](../conformance/README.md) against it.

## How a request is handled

Every request takes the same steps, in the order the spec gives its checks:

1. The rate limiter is asked.
2. The params are validated, then checked for what a schema cannot say.
3. In one transaction that holds the lock of the page or type: the target is found, the caller's access is checked with `permits`, a repeated `opId` gets its first result again, the limits are checked, and the operation runs.
4. One log record is written.

An operation declares its target, the access it needs and its checks, and brings what it does. A storage that fails makes the answer `Unavailable`. Anything else that is thrown is a defect: the answer is `Internal`, and the log record names the cause.

## Where things are

| Folder | What it holds |
|---|---|
| `ports` | The interfaces above |
| `access` | `Principal`, the access table, and who a log record names |
| `pipeline` | The steps of a request, shared by every operation |
| `pages`, `types` | The operations, and the keys and records of what they store |
| `ops` | The table of operations, and `createStore` |
| `memory`, `schema` | The two adapters |
