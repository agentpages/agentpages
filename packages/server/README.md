# @agentpages/server

The Store of the [agentpages protocol](../../spec/agentpages.md): what it does, without a transport. `@agentpages/mcp` puts it behind MCP.

## Create a Store

```ts
import { ajvSchemaCompiler, createMemoryStorage, createStore, unlimited } from "@agentpages/server";

const store = createStore(
  { storage: createMemoryStorage(), clock, ids, logger, limiter: unlimited, compiler: ajvSchemaCompiler },
  { capability: { limits }, baseUrl: "https://pages.example/p/", actorKey },
);

const answer = await store.call({ tool: "pages_publish", input, principal: { kind: "agent", subject: "alice" } });
```

`call` answers a tool call of an agent. `host` answers an operation a host runs for a viewer, and `view` a method a view calls on its host, both under the `requestId` the host chose. An `Answer` is a result, a failure of the spec, or `unknown-method` for what the Store does not have. `createStore` throws when its capability is not one of section 3 of the spec, its `baseUrl` is not a URL, or its `actorKey` is shorter than 32 bytes. `capability` is what the Store advertises, and `tools` the tools it lists. All the Store knows is in the storage. In memory it keeps only the 1024 compiled schemas it used last.

This package has the pages tools, the types tools, `pages_open`, the state tools and methods with their trees, and `identity/get`. The tools and methods of a feature exist exactly when the capability has the feature. Files, comments and rendering are not built yet: their tools are listed and answer `unknown-method`.

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

The `id` of a viewer is the HMAC-SHA-256 of the `pageId`, a slash and the subject under `actorKey`, as base64url. `identity/get`, commits and log records name a viewer by it. It is the same on one page, another on every other page, and another under another key, so keep the key secret and never change it. The log record of a request that names no page takes the `pageId` to be empty.

A new database is a new `Storage`. Run `storageSuite` and `storeSuite` of [@agentpages/conformance](../conformance/README.md) against it.

## How a request is handled

Every request takes the same steps, in the order the spec gives its checks:

1. The principal and the `requestId` are checked, then the rate limiter is asked.
2. The params are validated, then checked for what a schema cannot say.
3. In one transaction that holds the lock of the page or type: the target is found, the caller's access is checked with `permits`, a repeat with the same params gets its first result again, the limits are checked, an `opId` that was used with other params is refused, and the operation runs.
4. One log record is written. A logger that throws loses the record and leaves the answer as it is.

An operation declares its target, the access it needs and its checks, and brings what it does. A state operation is declared once, and answers both as a tool that names its page by `pageId` and as a view method whose page is behind its link. Every state request holds the lock of its page, reads included, so a commit never interleaves with a publish, a delete or a list of the same page. A commit to a typed page compiles the schemas of the collections its puts name and no others, and only those the Store does not keep compiled. A collection is a tree when any version of the type of its page declared it one, also while the version the page names leaves it out. A commit to the page scope of such a page takes these steps after the conditions of its ops: it finds the descendants of every tree document it deletes, checks that every tree document it puts has its parent and is not its own ancestor, and counts its changes. For each tree document that is not a root the Store keeps a row under its parent, written in the transaction of the commit, so the children of a document are one scan away. A delete reads the children of its document and of each descendant, a hundred at a time, and a put reads its ancestors up to the root.

A storage that fails, or a rate limiter whose promise rejects, makes the answer `Unavailable`. A stored record that is not what the Store saved, such as a page without an owner, is a defect. Anything else that is thrown is a defect: the answer is `Internal`, and the log record names the cause.

## Where things are

| Folder | What it holds |
|---|---|
| `ports` | The interfaces above |
| `access` | `Principal`, the access table, and who a log record names |
| `pipeline` | The steps of a request, shared by every operation |
| `pages`, `types`, `state`, `identity` | The operations, and the keys and records of what they store |
| `trees` | What a commit does to the trees of its scope: the cascade of a delete, the check of every put, and the rows of the children |
| `ops` | The table of operations, and `createStore` |
| `memory`, `schema` | The two adapters |
