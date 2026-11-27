# agentpages protocol

Version 0.1 (draft). The key words MUST, SHOULD and MAY are used as in RFC 2119.

A tag such as `[STATE-3]` identifies one requirement. Every tag is proven by a test that names it, or is listed in [untested.txt](untested.txt).

## 1. Scope

agentpages adds three things to [MCP Apps](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp):

1. **A View extension** (section 4): methods a page calls on its host for shared state, viewer identity and files.
2. **A Store** (section 5): an MCP server through which agents publish, version, share and discuss pages.
3. **Types** (section 6): reusable editors, such as a document or a slide deck, whose content is structured data that people and agents edit together.

A page is an MCP Apps View. Everything MCP Apps already defines is used unchanged and is not redefined here. The MCP Apps text this version was written against is pinned in [upstream.json](upstream.json).

| Need | MCP Apps mechanism |
|---|---|
| Lifecycle, sandbox, CSP, permissions | `ui/initialize`, `_meta.ui.csp`, `_meta.ui.permissions` |
| Model calls from the page | `sampling/createMessage` |
| Saving a file to the viewer's device | `ui/download-file` |
| Sending an action to the chat | `ui/message`, `ui/update-model-context` |
| Checking that a view is alive | `ping` |

## 2. Model

- **Page**: something an agent published, identified by a `pageId`. Its content is either its own HTML or a type.
- **Version**: an immutable snapshot of a page's content, numbered from 1.
- **Type**: a published editor plus the schemas of the data it edits.
- **Store**: the MCP server that owns pages, types and all their state, files and comments.
- **Host**: the application that renders a page in a sandboxed iframe. A host is bound to exactly one Store and keeps no page data of its own.
- **View**: a page running inside a host.
- **Viewer**: the person looking at a view. A viewer the Store cannot identify is anonymous.
- **Owner**: the authenticated MCP principal that created the page or type.
- **Client**: whoever originates a request: a view, or an agent.

Because the Store is the single owner of data, a write through a view is visible to Store tools and the reverse. The wire interface between a host and its Store is not part of 0.1 (section 10).

### 2.1 Common rules

- Ids (`collection`, document `id`, file `id`, `typeId`) are chosen by the caller and match `^[A-Za-z0-9_-]{1,128}$`. Any other value returns `InvalidParams`. `[COMMON-1]`
- A `pageId` and an `opId` are UUIDs chosen by the caller. Any other value returns `InvalidParams`. `[COMMON-2]`
- Timestamps are RFC 3339 strings. `[COMMON-3]`
- Every method that takes `cursor?` also takes `limit?` (1 to 100, default 100) and returns `nextCursor` exactly when more items exist. `[COMMON-4]`
- A caller without access gets `Forbidden`, whatever else is wrong with the request. `[COMMON-5]`

## 3. Extension identifier

The extension is `io.github.agentpages/agentpages`, following the MCP extension naming rule (SEP-2133). Its view methods use the prefix `agentpages/`.

```json
{
  "io.github.agentpages/agentpages": {
    "version": "0.1",
    "limits": {
      "requestTimeoutMs": 30000,
      "syncIntervalMs": 30000,
      "maxHtmlBytes": 1048576,
      "opRetentionSeconds": 86400,
      "commitRetentionSeconds": 604800
    },
    "state": { "maxDocumentBytes": 262144, "maxOpsPerCommit": 100, "liveChanges": true },
    "identity": {},
    "files": { "maxFileBytes": 10485760 }
  }
}
```

- A host advertises this object in the `ui/initialize` result under `hostCapabilities.experimental`. `[EXT-1]`
- A Store advertises the same object under `capabilities.extensions`. `[EXT-2]`
- `state`, `identity` and `files` are features. A feature is available exactly when its key is present. `[EXT-3]`
- A host MUST answer a method of an absent feature with JSON-RPC error `-32601`. `[EXT-4]`

## 4. View extension

All messages are JSON-RPC 2.0 over the MCP Apps `postMessage` transport.

### 4.1 State

JSON documents owned by the page and kept across its versions. Every change is a commit in an ordered log, which makes live updates, reconnection and retries one mechanism.

```ts
type Scope = "page" | "viewer";

type Actor = { kind: "viewer"; id: string } | { kind: "anonymous" } | { kind: "agent" };

interface Document {
  collection: string;
  id: string;
  data: Record<string, unknown>;
  revision: number;
  updatedAt: string;
  updatedBy: Actor;
}

type Op =
  | { op: "put"; collection: string; id: string; data: Record<string, unknown>; ifRevision?: number }
  | { op: "delete"; collection: string; id: string; ifRevision?: number };

interface Change {
  collection: string;
  id: string;
  revision: number;
  document: Document | null;
}

interface Commit {
  seq: number;
  opId: string;
  at: string;
  by: Actor;
  changes: Change[];
}
```

| Id | Method | Params | Result |
|---|---|---|---|
| `[STATE-1]` | `agentpages/state/get` | `{ scope, collection, id }` | `{ document: Document \| null }` |
| `[STATE-2]` | `agentpages/state/list` | `{ scope, collection, cursor?, limit? }` | `{ documents: Document[], seq: number, nextCursor?: string }` |
| `[STATE-3]` | `agentpages/state/commit` | `{ scope, opId, ops: Op[] }` | `{ commit: Commit }` |
| `[STATE-4]` | `agentpages/state/commits` | `{ scope, since, limit? }` | `{ commits: Commit[], seq: number }` |

**Scopes**

- `page` scope documents are shared by every viewer of the page. `[STATE-5]`
- `viewer` scope documents are private to the current viewer. `[STATE-6]`
- `viewer` scope with an anonymous viewer returns `Unauthenticated`. `[STATE-7]`
- `by` and `updatedBy` name who made the change. `[STATE-8]`

**Commits**

- `commit` applies all of its ops or none of them. `[STATE-9]`
- A page has one log for its `page` scope and one for each viewer's `viewer` scope. A successful commit gets the next `seq` of its log, starting at 1, with no gaps. `[STATE-10]`
- A `put` replaces the whole document. `[STATE-11]`
- A `delete` of a missing document changes nothing and produces no `Change`. `[STATE-12]`
- A commit whose ops change nothing still succeeds and takes a `seq`. `[STATE-13]`
- A commit with more than `maxOpsPerCommit` ops, or with two ops on the same document, returns `InvalidParams`. `[STATE-14]`
- `data` larger than `maxDocumentBytes`, measured as UTF-8 JSON, returns `LimitExceeded`. `[STATE-15]`

**Revisions**

- Each `(scope, collection, id)` has a revision counter that starts at 0 and never resets. Every `put`, and every `delete` of an existing document, increases it by 1. A document created after a delete continues the count. `[STATE-16]`
- An op with `ifRevision` succeeds only if the counter equals it. Otherwise the whole commit returns `Conflict`. `ifRevision: 0` instead means the document does not exist now. `[STATE-17]`

**Reading**

- `list` orders by `id`, ascending by code point. `seq` is a log position the response is at least as new as. `[STATE-18]`
- `commits` returns up to `limit` commits with `seq` greater than `since`, in order, and the current `seq`. A `since` greater than the current `seq` returns `InvalidParams`. `[STATE-19]`
- A Store keeps commits for at least `commitRetentionSeconds`. `commits` with a `since` older than what it keeps returns `ResyncRequired`. `[STATE-20]`

**Live changes**

If `liveChanges` is `true`, the host sends each `page` scope commit to every open view of the page, and each `viewer` scope commit to every open view of that viewer on the page, including the view that made it. `[STATE-21]`

```json
{ "method": "agentpages/state/committed", "params": { "scope": "page", "commit": { "seq": 4, "opId": "…", "at": "…", "by": { "kind": "agent" }, "changes": [] } } }
```

Delivery is best effort: a commit can arrive more than once, out of order, or not at all. A view MUST apply commits in `seq` order, ignore a `seq` it has already applied, and fetch any gap with `commits`. `[STATE-22]`

### 4.2 Trees

A type can declare a collection to be a tree (section 6). Tree documents carry their position in `data`:

```ts
interface TreeNode {
  parent: string | null;
  index: string;
  [field: string]: unknown;
}
```

- Exactly the documents with `parent: null` are roots. `parent` names a document of the same collection. `[TREE-1]`
- `index` matches `^[0-9A-Za-z]*[1-9A-Za-z]$`. Any other value returns `InvalidParams`. `[TREE-2]`
- Siblings are ordered by `index`, ascending by code point, then by `id`. `[TREE-3]`
- A commit that would leave a tree document with a missing parent, or would create a cycle, returns `Conflict`. `[TREE-4]`
- Deleting a tree document also deletes all its descendants in the same commit. Each is a `Change`. `[TREE-5]`

A client moves a node by putting it with a new `parent` or `index`. To insert between two siblings, it picks an `index` that sorts between theirs; because no `index` ends in `0`, one always exists. A client SHOULD end a new `index` with a few random characters so that two clients inserting at the same place do not pick the same one. If two siblings do share an `index`, a client inserting between them gives one of them a new `index` in the same commit.

### 4.3 Identity

```ts
interface Viewer {
  id: string;
  name?: string;
}
```

| Id | Method | Params | Result |
|---|---|---|---|
| `[IDENT-1]` | `agentpages/identity/get` | `{}` | `{ viewer: Viewer \| null }` |

- `viewer` is `null` for an anonymous viewer. `[IDENT-2]`
- `id` is opaque and MUST be the same for the same person on the same page. `[IDENT-3]`
- A host MUST NOT expose any other field through this method. `[IDENT-4]`

### 4.4 Files

Binary files owned by the page and shared by every viewer.

```ts
interface FileInfo {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  updatedAt: string;
  updatedBy: Actor;
}
```

| Id | Method | Params | Result |
|---|---|---|---|
| `[FILES-1]` | `agentpages/files/put` | `{ opId, id, name, mimeType, blob }` | `{ file: FileInfo }` |
| `[FILES-2]` | `agentpages/files/get` | `{ id }` | `{ file: FileInfo, blob: string }` |
| `[FILES-3]` | `agentpages/files/list` | `{ cursor?, limit? }` | `{ files: FileInfo[], nextCursor?: string }` |
| `[FILES-4]` | `agentpages/files/delete` | `{ opId, id }` | `{}` |

- `blob` is base64, as in MCP `BlobResourceContents`. `size` is the decoded length in bytes. `[FILES-5]`
- `put` replaces any file with the same `id`. `[FILES-6]`
- A file whose `size` exceeds `maxFileBytes` returns `LimitExceeded`. `[FILES-7]`
- `get` of a missing file returns `NotFound`. `[FILES-8]`
- `delete` of a missing file succeeds. `[FILES-9]`
- `list` orders by `id`, ascending by code point. `[FILES-10]`

### 4.5 Errors

A failed view method returns a JSON-RPC error with one of these codes and this `data`. `[ERR-1]`

```ts
interface ErrorData {
  requestId: string;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
  opIndex?: number;
}
```

| Name | Code | Retryable | Meaning |
|---|---|---|---|
| `NotFound` | `-32050` | no | The thing does not exist. |
| `Conflict` | `-32051` | no | The request was based on stale data. Read again, then decide. |
| `Unauthenticated` | `-32052` | no | The viewer is anonymous and must not be. |
| `Forbidden` | `-32053` | no | The caller may not do this. |
| `LimitExceeded` | `-32054` | no | The request is too large, or a quota is used up. |
| `Unavailable` | `-32055` | yes | A temporary failure. The outcome is unknown. |
| `RateLimited` | `-32056` | yes | Too many requests. Carries `retryAfterMs`. |
| `ResyncRequired` | `-32057` | no | The commit log no longer reaches `since`. List again. |
| `InvalidParams` | `-32602` | no | The request is malformed. |
| `Internal` | `-32603` | no | A defect. Logged with its cause. |

- `retryable` MUST equal the table. `[ERR-2]`
- `message` says what was wrong in words a developer or an agent can act on. `opIndex` is the position of the failing op in a commit. `[ERR-3]`

## 5. Store

The Store is an MCP server. MCP is the only agent interface.

- Every Store tool MUST declare `_meta.ui.visibility: ["model"]`, so that no view can call it. `[STORE-1]`
- A tool returns its output as `structuredContent`. `[STORE-2]`
- A failure returns `isError: true` with `structuredContent` of `{ "error": "<Name>" } & ErrorData`, using the names of section 4.5. `[STORE-3]`
- Store tools declare no `outputSchema`. `[STORE-4]`
- Every tool that changes anything takes an `opId`. `[STORE-5]`

### 5.1 Access

A page's `access` is `private`, `link-read` or `link-write`. With a link setting, anyone who has the page's `url` is a link holder.

| Id | Actor | `private` | `link-read` | `link-write` |
|---|---|---|---|---|
| `[ACCESS-1]` | Owner, through Store tools | everything | everything | everything |
| `[ACCESS-2]` | Any other MCP principal | `Forbidden` | `Forbidden` | `Forbidden` |
| `[ACCESS-3]` | Owner, as a viewer | read and write | read and write | read and write |
| `[ACCESS-4]` | Link holder | nothing | read | read and write |

- Read covers opening the page and reading its `page` scope state, files and comments. Write adds changing `page` scope state and files, and commenting. `[ACCESS-5]`
- A signed-in viewer with read access can read and write their own `viewer` scope state. `[ACCESS-6]`
- Access does not depend on whether a viewer is anonymous. `[ACCESS-7]`

A Store MAY refuse anonymous viewers altogether.

### 5.2 Pages

```ts
interface PageInfo {
  pageId: string;
  title: string;
  description?: string;
  version: number;
  access: "private" | "link-read" | "link-write";
  url: string;
  updatedAt: string;
}

type PageContent =
  | { html: string; csp?: McpUiCsp; permissions?: McpUiPermissions }
  | { typeId: string; typeVersion: number };
```

`html` is a complete HTML document. `csp` and `permissions` are the MCP Apps `_meta.ui.csp` and `_meta.ui.permissions` objects.

| Id | Tool | Input | Output |
|---|---|---|---|
| `[PAGES-1]` | `pages_publish` | `{ opId, pageId, baseVersion, title, description?, content: PageContent }` | `PageInfo` |
| `[PAGES-2]` | `pages_get` | `{ pageId, version? }` | `PageInfo & { content: PageContent }` |
| `[PAGES-3]` | `pages_list` | `{ cursor?, limit? }` | `{ pages: PageInfo[], nextCursor?: string }` |
| `[PAGES-4]` | `pages_versions` | `{ pageId, cursor?, limit? }` | `{ versions: { version: number, createdAt: string }[], nextCursor?: string }` |
| `[PAGES-5]` | `pages_set_access` | `{ opId, pageId, access }` | `PageInfo` |
| `[PAGES-6]` | `pages_delete` | `{ opId, pageId }` | `{}` |

- `pages_publish` succeeds only if `baseVersion` equals the page's current version, where a page that does not exist has version 0. Otherwise the Store returns `Conflict`. Success creates version `baseVersion + 1`. `[PAGES-7]`
- A published version never changes. `[PAGES-8]`
- `html` larger than `maxHtmlBytes` returns `LimitExceeded`. `[PAGES-17]`
- A deleted `pageId` is never used again. Every request that names it returns `NotFound`, except `pages_delete`. `[PAGES-18]`
- When a page's current version changes, the host reloads every open view of it. `[PAGES-19]`
- `csp` and `permissions` belong to a version: a version published without them has none. `[PAGES-9]`
- A new page is `private`. `[PAGES-10]`
- `pages_get` without `version` returns the current version. `[PAGES-11]`
- `pages_list` returns the caller's pages, most recently updated first. `[PAGES-12]`
- `pages_versions` orders by `version`, ascending. `[PAGES-13]`
- `pages_delete` removes the page with its versions, state, files and comments. `[PAGES-14]`
- `pages_delete` of a missing page succeeds. `[PAGES-15]`
- Each version with `html` is an MCP resource at `ui://agentpages/{pageId}/{version}` with MIME type `text/html;profile=mcp-app` and its `csp` and `permissions` under `_meta.ui`. `[PAGES-16]`

A host treats a version's `csp` and `permissions` as MCP Apps specifies.

### 5.3 State and files

- The Store exposes each method of sections 4.1 and 4.4 as a tool with the same params plus `pageId`, and the same result and errors. The tool name drops `agentpages/`, then replaces `/` with `_`: `state_get`, `state_list`, `state_commit`, `state_commits`, `files_put`, `files_get`, `files_list`, `files_delete`. `[TOOLS-1]`
- Agents use `page` scope only. A tool call with `viewer` scope returns `Forbidden`. `[TOOLS-2]`

An agent follows other people's edits by calling `state_commits` with the last `seq` it saw.

### 5.4 Comments

Viewers comment in the host's own interface, outside the iframe. Agents read and answer through the Store.

```ts
interface Thread {
  id: string;
  pageId: string;
  version: number;
  quote?: string;
  status: "open" | "resolved";
  entries: Entry[];
}

interface Entry {
  id: string;
  author: Viewer | null;
  body: string;
  createdAt: string;
}
```

`version` is the version the thread was started on. `quote` is the page text it refers to. `author` is `null` for an agent.

| Id | Tool | Input | Output |
|---|---|---|---|
| `[COMMENTS-1]` | `comments_list` | `{ pageId, status?, cursor?, limit? }` | `{ threads: Thread[], nextCursor?: string }` |
| `[COMMENTS-2]` | `comments_reply` | `{ opId, pageId, threadId, body }` | `Thread` |
| `[COMMENTS-3]` | `comments_resolve` | `{ opId, pageId, threadId }` | `Thread` |

- `entries` has at least one entry and is ordered oldest first. `[COMMENTS-4]`
- `comments_list` orders threads by the `createdAt` of their first entry, oldest first. `[COMMENTS-5]`
- `comments_resolve` on a resolved thread succeeds. `[COMMENTS-6]`
- The `id` of an entry added by `comments_reply` is its `opId`. `[COMMENTS-7]`

## 6. Types

A type is an editor that many pages share. Its page is ordinary HTML that reads and writes state through section 4. Its schemas say what that state may contain, so a person using the editor and an agent using Store tools work on the same validated data.

```ts
interface TypeInfo {
  typeId: string;
  version: number;
  title: string;
  description: string;
  instructions: string;
  collections: Record<string, { schema: JsonSchema; tree?: true }>;
  updatedAt: string;
}

interface TypeContent {
  html: string;
  csp?: McpUiCsp;
  permissions?: McpUiPermissions;
}
```

`instructions` tells an agent how to fill a page of this type. `schema` is a JSON Schema (2020-12) for the `data` of documents in that collection. `tree` makes the collection a tree (section 4.2).

| Id | Tool | Input | Output |
|---|---|---|---|
| `[TYPES-1]` | `types_publish` | `{ opId, typeId, baseVersion, title, description, instructions, collections, content: TypeContent }` | `TypeInfo` |
| `[TYPES-2]` | `types_get` | `{ typeId, version? }` | `TypeInfo & { content: TypeContent }` |
| `[TYPES-3]` | `types_list` | `{ cursor?, limit? }` | `{ types: TypeInfo[], nextCursor?: string }` |

- `types_publish` follows the `baseVersion` rule of `pages_publish`, and a published type version never changes. `[TYPES-4]`
- Only a type's owner can publish a new version of it. Any MCP principal can read a type and publish pages of it. `[TYPES-5]`
- `types_list` orders by `typeId`, ascending by code point. `[TYPES-6]`
- A page whose content is `{ typeId, typeVersion }` renders that type version's `html`, `csp` and `permissions`. `[TYPES-7]`
- `pages_publish` with a type or type version that does not exist returns `NotFound`. `[TYPES-8]`
- In the `page` scope of a typed page, a commit that puts a document into a collection the type does not declare, or whose `data` does not match that collection's `schema`, returns `InvalidParams`. The type version is the one the page names when the commit arrives. `[TYPES-9]`
- A page moves to a newer type version only by publishing a new page version that names it. `[TYPES-10]`
- Documents already stored are not checked again when a page moves to another type version. `[TYPES-11]`
- A collection is a tree in every version of a type or in none. `types_publish` that changes this returns `InvalidParams`. `[TYPES-12]`

## 7. Reliability

A client must be able to assume that the network fails, that requests arrive twice, and that notifications arrive late, out of order or not at all.

### 7.1 Idempotency

- Every request that changes anything carries an `opId`. `[REL-1]`
- However many times and however close together a Store receives an `opId`, it applies the request once and answers every copy with the same result. `[REL-2]`
- An `opId` reused with different params returns `InvalidParams`. `[REL-3]`
- A Store remembers an `opId` for at least `opRetentionSeconds`. `[REL-4]`
- A client MUST NOT send an `opId` it first sent more than `opRetentionSeconds` ago. It reports that request as failed with an unknown outcome. `[REL-5]`

### 7.2 Durability

- A Store answers a changing request with success only after the change is durable. `[REL-6]`
- A changing request and the record of its `opId` are saved together, completely or not at all, including across a crash. `[REL-7]`
- A request the Store answered with an error other than `Unavailable` changed nothing. `[REL-8]`

### 7.3 Timeouts and retries

These rules bind a view. An agent's tool descriptions tell it to repeat a failed call with the same `opId`.

- A view gives up on a request after `requestTimeoutMs` and treats it as a retryable failure with an unknown outcome. `[REL-9]`
- A view retries only a timeout or an error with `retryable: true`, and always with the same `opId`. `[REL-10]`
- Only the view that originated a request retries it. A host MUST NOT retry a view's request on its behalf. `[REL-11]`
- The wait before retry `n` (from 0) is `retryAfterMs`, or 0 without one, plus a random time between 0 and `250 × 2ⁿ` milliseconds. `[REL-12]`
- A view stops after 6 attempts and reports the last error to the page. `[REL-13]`

### 7.4 Staying in sync

- A view that lists documents and then follows commits starts from the smallest `seq` any of its `list` responses returned. `[REL-14]`
- A view that follows commits calls `commits` at least once every `syncIntervalMs`, and after any interruption before it shows state as current. `[REL-15]`
- On `ResyncRequired`, a view discards its copy and lists again. `[REL-16]`
- A host passes a new page version or a deleted page to its open views by reloading or closing them. A view never carries a `seq` from one page to another. `[REL-17]`

### 7.5 Unsent commits

- A view sends its commits one at a time, in the order the page made them. `[REL-18]`
- A commit that exhausts its attempts stays first in line. The view tries it again at the next `syncIntervalMs`. `[REL-19]`
- When a commit returns an error that is not retryable, the view reports that commit and every commit behind it to the page as failed, and removes them. None is dropped silently and none is sent. `[REL-20]`
- A view tells the page whether it has unsent commits. They do not survive a reload. `[REL-21]`

### 7.6 Overload and liveness

- A Store that limits request rates MUST answer with `RateLimited` and a `retryAfterMs`. `[REL-22]`
- A host that gets no answer to an MCP Apps `ping` within `requestTimeoutMs` MUST tell the viewer the page stopped responding and offer to reload it. The rest of the host keeps working. `[REL-23]`

### 7.7 Logging

A Store and a host emit one log record for every request they handle. `[REL-24]`

```ts
interface LogRecord {
  at: string;
  requestId: string;
  opId?: string;
  pageId?: string;
  scope?: Scope;
  seq?: number;
  actor: Actor;
  method: string;
  outcome: "ok" | "error";
  error?: string;
  cause?: string;
  durationMs: number;
}
```

- A host chooses the `requestId` of a view request and passes it to the Store, so both records and the `ErrorData` share it. `[REL-25]`
- `seq` is the commit a request created. `[REL-26]`
- `Internal` errors carry a `cause`. `[REL-27]`
- No field of a log record, `cause` included, contains document data, file contents, HTML or credentials. `[REL-28]`

## 8. Security

The sandbox, origin and CSP requirements of MCP Apps apply in full. In addition:

- A host MUST serve each page from an origin shared with no other page. `[SEC-1]`
- A host MUST derive the page of a view request from the sending iframe window, never from message content. `[SEC-2]`
- A host MUST NOT give a view any credential of the viewer or of the Store. `[SEC-3]`
- A Store MUST enforce section 5.1 on every tool call and every view request. `[SEC-4]`
- `viewer` scope documents MUST NOT be readable by any other viewer or by agents. `[SEC-5]`
- A type's `html` is as untrusted as any page's and runs under the same sandbox. `[SEC-6]`

## 9. Versioning

`version` is `major.minor`. Later versions under this identifier only add optional fields, methods or features. A breaking change uses a new extension identifier, as SEP-2133 requires. The identifier is final at 1.0 (section 10).

A receiver MUST ignore fields it does not know. `[VER-1]`

## 10. Open questions

1. **Vendor prefix.** SEP-2133 asks for a reversed domain the project controls. `io.github.agentpages` satisfies that through the project's GitHub organization. A project domain could replace it before 1.0.
2. **Host to Store interface.** In 0.1 a host and its Store are one deployment. A wire interface that lets a host from one vendor use a Store from another is not specified.
3. **Inline rendering in third-party hosts.** MCP Apps has no mechanism for a tool result to select a per-page `ui://` resource.
4. **Comment delivery.** Agents poll `comments_list`. Push delivery depends on the harness and is not specified.
5. **Text edited by two people at once.** A commit replaces whole documents, so two people typing in the same paragraph conflict. Merging inside a document is not specified.
6. **Large files.** A file travels in one request. Resumable upload is not specified.
7. **History of typed pages.** The commit log records every change, but restoring a typed page to an earlier point is not specified.
