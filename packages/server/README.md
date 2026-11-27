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

`call` answers a tool call of an agent. `host` answers an operation a host runs for a viewer, and `view` a method a view calls on its host, both under the `requestId` the host chose. An `Answer` is a result, a failure of the spec, or `unknown-method` for what the Store does not have. `createStore` throws when its capability is not one of section 3 of the spec, or its `baseUrl` is not a URL. `capability` is what the Store advertises, and `tools` the tools it lists. The Store keeps nothing in memory: all it knows is in the storage.

This package has the pages tools, the types tools, `pages_open`, the state tools and methods, and `identity/get`. The tools and methods of a feature exist exactly when the capability has the feature. Trees, files, comments and rendering are not built yet: a tree collection is checked against its schema only, and the other tools are listed and answer `unknown-method`.

## Ports

A Store depends on six interfaces, and on nothing else outside the protocol.

| Port | What it gives the Store | Adapter here |
|---|---|---|
| `Storage` | An ordered key-value store with transactions that are serial per lock key. Its types are [@agentpages/storage](../storage/README.md) | `createMemoryStorage` |
| `Clock` | The time | |
| `Ids` | Request ids, and the secret of a page's `url` | |
| `Logger` | Where log records go | |
| `RateLimiter` | Whether a request must wait | `unlimited` |
| `SchemaCompiler` | Whether a JSON Schema is valid, and whether data matches it | `ajvSchemaCompiler` |

Who makes a request is not a port but a value the transport passes: a `Principal`. Agents and viewers share one namespace of subjects. The page link a viewer presents is the `url` in the input of a host operation, or the `url` beside the params of a view method, and nowhere else. It names the page, and makes the viewer a link holder when it is the page's current one. What a view sends is never trusted to name a page.

A new database is a new `Storage`. Run `storageSuite` and `storeSuite` of [@agentpages/conformance](../conformance/README.md) against it.

## How a request is handled

Every request takes the same steps, in the order the spec gives its checks:

1. The principal and the `requestId` are checked, then the rate limiter is asked.
2. The params are validated, then checked for what a schema cannot say.
3. In one transaction that holds the lock of the page or type: the target is found, the caller's access is checked with `permits`, a repeated `opId` gets its first result again, the limits are checked, and the operation runs.
4. One log record is written. A logger that throws loses the record and leaves the answer as it is.

An operation declares its target, the access it needs and its checks, and brings what it does. A state operation is declared once, and answers both as a tool that names its page by `pageId` and as a view method whose page is behind its link. Every state request holds the lock of its page, reads included, so a commit never interleaves with a publish, a delete or a list of the same page. A storage that fails, or a rate limiter whose promise rejects, makes the answer `Unavailable`. A stored record that is not what the Store saved, such as a page without an owner, is a defect. Anything else that is thrown is a defect: the answer is `Internal`, and the log record names the cause.

## Where things are

| Folder | What it holds |
|---|---|
| `ports` | The interfaces above |
| `access` | `Principal`, the access table, and who a log record names |
| `pipeline` | The steps of a request, shared by every operation |
| `pages`, `types`, `state`, `identity` | The operations, and the keys and records of what they store |
| `ops` | The table of operations, and `createStore` |
| `memory`, `schema` | The two adapters |
