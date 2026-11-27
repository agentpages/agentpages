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

This package has the pages tools, the types tools, `pages_open`, the comments tools and host operations, `pages_heads`, the state tools and methods with their trees, `identity/get`, and the files tools and methods. The tools and methods of a feature exist exactly when the capability has the feature. Comments are no feature: every Store has them. Rendering is not built yet: its tools are listed and answer `unknown-method`.

## Ports

A Store depends on six interfaces, and on nothing else outside the protocol.

| Port | What it gives the Store | Adapter here |
|---|---|---|
| `Storage` | An ordered key-value store with transactions that are serial per lock key. Its types are [@agentpages/storage](../storage/README.md) | `createMemoryStorage` |
| `Clock` | The time. Its type is in `@agentpages/storage` | |
| `Ids` | Request ids, and the secret of a page's `url` | |
| `Logger` | Where log records go | |
| `RateLimiter` | Whether a request must wait | `unlimited` |
| `SchemaCompiler` | Whether a JSON Schema is valid, and whether data matches it | `ajvSchemaCompiler` |

Who makes a request is not a port but a value the transport passes: a `Principal`. Agents and viewers share one namespace of subjects. The page link a viewer presents is the `url` in the input of a host operation, or the `url` beside the params of a view method, and nowhere else. It names the page, and makes the viewer a link holder when it is the page's current one. What a view sends is never trusted to name a page.

The `id` of a viewer is the HMAC-SHA-256 of the `pageId`, a slash and the subject under `actorKey`, as base64url. `identity/get`, commits and log records name a viewer by it. It is the same on one page, another on every other page, and another under another key, so keep the key secret and never change it. The log record of a request that names no page takes the `pageId` to be empty.

A new database is a new `Storage`, as [@agentpages/sqlite](../sqlite/README.md) is. Run `storageSuite` and `storeSuite` of [@agentpages/conformance](../conformance/README.md) against it.

## How a request is handled

Every request takes the same steps, in the order the spec gives its checks:

1. The principal and the `requestId` are checked, then the rate limiter is asked.
2. The params are validated, then checked for what a schema cannot say.
3. In one transaction that holds the lock of the page or type: the target is found, the caller's access is checked with `permits`, a repeat with the same params gets its first result again, the limits are checked, an `opId` that was used with other params is refused, and the operation runs.
4. One log record is written. A logger that throws loses the record and leaves the answer as it is.

An operation declares its target, the access it needs and its checks, and brings what it does. A state operation is declared once, and answers both as a tool that names its page by `pageId` and as a view method whose page is behind its link. Every state request holds the lock of its page, reads included, so a commit never interleaves with a publish, a delete or a list of the same page. A commit to a typed page compiles the schemas of the collections its puts name and no others, and only those the Store does not keep compiled. A collection is a tree when any version of the type of its page declared it one, also while the version the page names leaves it out. A commit to the page scope of such a page decides in the order of section 4.2 of the spec. It first finds the descendants of every tree document it deletes, with one scan for the children of each, and stops as soon as its changes are more than `maxOpsPerCommit`: a delete that is refused reads no more than that, however large its subtree. It then climbs from every document a put places, all of them one level at a time with one read for each level, and no further than `maxTreeDepth`. A put that keeps its parent reads no ancestor. For each tree document that is not a root the Store keeps a row under its parent, written in the transaction of the commit, so the children of a document are one scan away.

A comments operation is declared once too, and answers as a tool of an agent and as a host operation for a viewer, who names the page by the `url` they present. A thread is saved once, under a key that sorts by when it was started and then by its id, which is the order of `comments_list`. A second row per thread, under its status, is what a list of one status pages through, and a third finds a thread by its id. Every start, reply and resolve also adds 1 to a count of the page, in the same transaction. The record of a remembered reply or resolve does not hold the thread: it holds how many entries the thread had and its status, and a repeat gets the stored thread cut back to that. A change says how its result is remembered and recalled, and one that says nothing has its whole result remembered.

`pages_heads` is one read of four rows under no lock: the page, the heads of the page scope and of the viewer's own scope, and the count of the comments. A host polls it, and no writer waits for it.

A storage that fails, or a rate limiter whose promise rejects, makes the answer `Unavailable`. A stored record that is not what the Store saved, such as a page without an owner, is a defect. Anything else that is thrown is a defect: the answer is `Internal`, and the log record names the cause.

## Sweep

A files operation is declared once, as a state operation is. A file is two rows under its page: its `FileInfo`, and its bytes as the storage takes them, so a list reads no bytes and deleting the page deletes its files with it. `maxFileBytes` is the largest value the storage must take. A put decodes the `blob` once, and what the Store remembers of it is the `FileInfo` alone. The Store keeps `name` and `mimeType` as they came and serves no file by URL.

`sweep(limit)` deletes what is past its retention: the requests the Store remembers, `requestTimeoutMs` after `opRetentionSeconds`, and the commits of its logs, `requestTimeoutMs` after `commitRetentionSeconds`. Nothing else expires. No request triggers it and it is not a tool: the deployment calls it on a timer. It clears at most `limit` of each of the two kinds, the oldest first, and resolves with how many it cleared: 0 means nothing is past retention now. A `limit` that is not a positive safe integer throws a `RangeError`. Any number of processes may call it at any time. When it rejects, the storage failed: call it again.

With every remembered request and every commit, the Store writes a note of when, in the same transaction, under a key that sorts by time. A sweep scans the oldest notes without a lock. Then, for each page or type, in one transaction under its lock, it reads the notes again with their rows, and deletes each note that is still there, with its row when the row was written when the note says. A request that was remembered again under the same `opId` was written at another time, and stays. The notes of a deleted page stay until a sweep deletes them. `state/commits` answers `ResyncRequired` when a commit is missing among those it would return.

## Where things are

| Folder | What it holds |
|---|---|
| `ports` | The interfaces above |
| `access` | `Principal`, the access table, and who a log record names |
| `pipeline` | The steps of a request, shared by every operation, and the sweep |
| `pages`, `types`, `state`, `identity`, `files`, `comments` | The operations, and the keys and records of what they store |
| `trees` | What a commit does to the trees of its scope: the cascade of a delete within its limit, the climb from every document a put places, and the rows of the children |
| `ops` | The table of operations, and `createStore` |
| `memory`, `schema` | The two adapters |
