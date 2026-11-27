# agentpages protocol

Version 0.1 (draft). The key words MUST, SHOULD and MAY are used as in RFC 2119.

## 1. Scope

agentpages adds two things to [MCP Apps](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp):

1. **A View extension** (section 4): methods a page calls on its host for shared state, viewer identity and files.
2. **A Store** (section 5): an MCP server through which agents publish, version, share and discuss pages.

A page is an MCP Apps View. Everything MCP Apps already defines is used unchanged and is not redefined here:

| Need | MCP Apps mechanism |
|---|---|
| Lifecycle, sandbox, CSP, permissions | `ui/initialize`, `_meta.ui.csp`, `_meta.ui.permissions` |
| Model calls from the page | `sampling/createMessage` |
| Saving a file to the viewer's device | `ui/download-file` |
| Sending an action to the chat | `ui/message`, `ui/update-model-context` |

## 2. Model

- **Page**: an HTML document published by an agent, identified by a `pageId`.
- **Version**: an immutable snapshot of a page, numbered from 1.
- **Store**: the MCP server that owns pages and all their state, files and comments.
- **Host**: the application that renders a page in a sandboxed iframe. A host is bound to exactly one Store and keeps no page data of its own.
- **View**: a page running inside a host.
- **Viewer**: the person looking at a view. A viewer the Store cannot identify is anonymous.
- **Owner**: the authenticated MCP principal that created the page.

Because the Store is the single owner of data, a write through a view is visible to Store tools and the reverse. The wire interface between a host and its Store is not part of 0.1 (section 8).

### 2.1 Common rules

- Ids (`pageId`, `collection`, document `id`, file `id`, thread and entry `id`) are chosen by the caller and match `^[A-Za-z0-9_-]{1,128}$`. A `pageId` MUST be a UUID.
- Timestamps are RFC 3339 strings.
- Every list takes `cursor?` and `limit?` (1 to 100, default 100) and returns `nextCursor` when more items exist. Each list defines its order.
- Retrying a request never duplicates its effect.

## 3. Extension identifier

The extension is `io.github.kuki1029/agentpages`, following the MCP extension naming rule (SEP-2133). Its view methods use the prefix `agentpages/`.

A host advertises it in the `ui/initialize` result under `hostCapabilities.experimental`, and a Store advertises the same object under `capabilities.extensions`:

```json
{
  "io.github.kuki1029/agentpages": {
    "version": "0.1",
    "state": { "maxDocumentBytes": 262144, "liveChanges": true },
    "identity": {},
    "files": { "maxFileBytes": 10485760 }
  }
}
```

`state`, `identity` and `files` are features. A feature is available only if its key is present. A host MUST answer a method of an absent feature with JSON-RPC error `-32601`.

## 4. View extension

All messages are JSON-RPC 2.0 over the MCP Apps `postMessage` transport.

### 4.1 State

Shared JSON documents, owned by the page and kept across its versions.

```ts
type Scope = "page" | "viewer";

interface Document {
  collection: string;
  id: string;
  data: Record<string, unknown>;
  revision: number;
  updatedAt: string;
  updatedBy: string | null;
}
```

`page` scope is shared by every viewer. `viewer` scope is private to the current viewer. `updatedBy` is a viewer id, or `null` for an anonymous viewer or an agent.

| Method | Params | Result |
|---|---|---|
| `agentpages/state/get` | `{ scope, collection, id }` | `{ document: Document \| null }` |
| `agentpages/state/list` | `{ scope, collection, cursor?, limit? }` | `{ documents: Document[], nextCursor?: string }` |
| `agentpages/state/put` | `{ scope, collection, id, data, ifRevision? }` | `{ document: Document }` |
| `agentpages/state/delete` | `{ scope, collection, id, ifRevision? }` | `{}` |

- Each `(scope, collection, id)` has a revision counter that starts at 0 and never resets. Every `put` and every `delete` of an existing document increases it by 1. A document created after a delete continues the count.
- `put` replaces the whole document.
- With `ifRevision`, a `put` or `delete` succeeds only if the counter equals it, otherwise the host returns `Conflict`. `ifRevision: 0` means the document has never existed.
- Without `ifRevision`, `delete` of a missing document succeeds and changes nothing.
- `viewer` scope with an anonymous viewer returns `Unauthenticated`.
- `data` larger than `maxDocumentBytes`, measured as UTF-8 JSON, returns `LimitExceeded`.
- `list` orders by `id`, ascending by code point.

If `liveChanges` is `true`, the host MUST send this notification to every other open view of the page after each `page` scope change, from any view or agent:

```json
{ "method": "agentpages/state/changed",
  "params": { "collection": "votes", "id": "q1", "revision": 4, "document": null } }
```

`document` is the new document, or `null` after a delete. A view MUST ignore a notification whose `revision` is not greater than the latest it has seen for that document.

### 4.2 Identity

| Method | Params | Result |
|---|---|---|
| `agentpages/identity/get` | `{}` | `{ viewer: Viewer \| null }` |

```ts
interface Viewer {
  id: string;
  name?: string;
}
```

`viewer` is `null` for an anonymous viewer. `id` is opaque and MUST be stable for the same person on the same page. A host MUST NOT expose any other field through this method.

### 4.3 Files

Binary files owned by the page and shared by every viewer.

```ts
interface FileInfo {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  updatedAt: string;
  updatedBy: string | null;
}
```

| Method | Params | Result |
|---|---|---|
| `agentpages/files/put` | `{ id, name, mimeType, blob }` | `{ file: FileInfo }` |
| `agentpages/files/get` | `{ id }` | `{ file: FileInfo, blob: string }` |
| `agentpages/files/list` | `{ cursor?, limit? }` | `{ files: FileInfo[], nextCursor?: string }` |
| `agentpages/files/delete` | `{ id }` | `{}` |

- `blob` is base64, as in MCP `BlobResourceContents`. `size` is the decoded length in bytes.
- `put` replaces any file with the same `id`.
- A file whose `size` exceeds `maxFileBytes` returns `LimitExceeded`.
- `get` of a missing file returns `NotFound`. `delete` of a missing file succeeds.
- `list` orders by `id`, ascending by code point.

### 4.4 Errors

| Name | Code |
|---|---|
| `NotFound` | `-32050` |
| `Conflict` | `-32051` |
| `Unauthenticated` | `-32052` |
| `Forbidden` | `-32053` |
| `LimitExceeded` | `-32054` |
| `InvalidParams` | `-32602` |

## 5. Store

The Store is an MCP server. MCP is the only agent interface.

- Every Store tool MUST declare `_meta.ui.visibility: ["model"]`, so that no view can call it.
- A tool returns its output as `structuredContent`. A failure returns `isError: true` with `structuredContent` of `{ "error": "<Name>" }`, using the names of section 4.4. Store tools declare no `outputSchema`.

### 5.1 Access

| Actor | `private` page | `link` page |
|---|---|---|
| Owner, through Store tools | everything | everything |
| Any other MCP principal | `Forbidden` | `Forbidden` |
| Owner, as a viewer | view, state, files, comments | view, state, files, comments |
| Any other viewer | nothing | view, state, files, comments |

A viewer who can open a page can read and write its `page` scope state and its files, and can comment, whether anonymous or not. A Store MAY refuse anonymous viewers altogether.

### 5.2 Pages

```ts
interface PageInfo {
  pageId: string;
  title: string;
  description?: string;
  version: number;
  access: "private" | "link";
  url: string;
  updatedAt: string;
}

interface PageContent {
  html: string;
  csp?: McpUiCsp;
  permissions?: McpUiPermissions;
}
```

`csp` and `permissions` are the MCP Apps `_meta.ui.csp` and `_meta.ui.permissions` objects. They belong to a version: a version published without them has none.

| Tool | Input | Output |
|---|---|---|
| `pages_publish` | `PageContent & { pageId, baseVersion, title, description? }` | `PageInfo` |
| `pages_get` | `{ pageId, version? }` | `PageInfo & PageContent` |
| `pages_list` | `{ cursor?, limit? }` | `{ pages: PageInfo[], nextCursor?: string }` |
| `pages_versions` | `{ pageId, cursor?, limit? }` | `{ versions: { version: number, createdAt: string }[], nextCursor?: string }` |
| `pages_set_access` | `{ pageId, access }` | `PageInfo` |
| `pages_delete` | `{ pageId }` | `{}` |

- `html` is a complete HTML document.
- `pages_publish` succeeds only if `baseVersion` equals the page's current version, where a page that does not exist has version 0. Otherwise the Store returns `Conflict`. Success creates version `baseVersion + 1`.
- A new page is `private`.
- `pages_get` without `version` returns the current version.
- `pages_list` returns the caller's pages, most recently updated first. `pages_versions` orders by `version`, ascending.
- `pages_delete` removes the page with its versions, state, files and comments. Deleting a missing page succeeds.

Each version is also an MCP resource at `ui://agentpages/{pageId}/{version}` with MIME type `text/html;profile=mcp-app` and its `csp` and `permissions` under `_meta.ui`. A host treats them as MCP Apps specifies.

### 5.3 State and files

The Store exposes each method of sections 4.1 and 4.3 as a tool with the same params plus `pageId`, and the same result and errors. The tool name drops `agentpages/`, then replaces `/` with `_`: `state_get`, `state_list`, `state_put`, `state_delete`, `files_put`, `files_get`, `files_list`, `files_delete`.

Agents use `page` scope only. A tool call with `viewer` scope returns `Forbidden`.

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

`version` is the version the thread was started on. `quote` is the page text it refers to. `author` is `null` for an agent. `entries` has at least one entry and is ordered oldest first.

| Tool | Input | Output |
|---|---|---|
| `comments_list` | `{ pageId, status?, cursor?, limit? }` | `{ threads: Thread[], nextCursor?: string }` |
| `comments_reply` | `{ pageId, threadId, id, body }` | `Thread` |
| `comments_resolve` | `{ pageId, threadId }` | `Thread` |

- `comments_list` orders threads by the `createdAt` of their first entry, oldest first.
- `comments_reply` appends an entry with the given `id`. If the thread already has an entry with that `id`, the call changes nothing and succeeds.
- `comments_resolve` on a resolved thread succeeds.

## 6. Security

The sandbox, origin and CSP requirements of MCP Apps apply in full. In addition:

1. A host MUST serve each page from an origin shared with no other page.
2. A host MUST derive the page of a view request from the sending iframe window, never from message content.
3. A host MUST NOT give a view any credential of the viewer or of the Store.
4. A Store MUST enforce section 5.1 on every tool call and every view request.
5. `viewer` scope documents MUST NOT be readable by any other viewer or by agents.

## 7. Versioning

`version` is `major.minor`. Later versions under this identifier only add optional fields, methods or features, and a receiver MUST ignore fields it does not know. A breaking change uses a new extension identifier, as SEP-2133 requires. The identifier is final at 1.0 (section 8).

## 8. Open questions

1. **Vendor prefix.** SEP-2133 asks for a reversed domain the project controls. `io.github.kuki1029` satisfies that today; a project domain would replace it before 1.0.
2. **Host to Store interface.** In 0.1 a host and its Store are one deployment. A wire interface that lets a host from one vendor use a Store from another is not specified.
3. **Inline rendering in third-party hosts.** MCP Apps has no mechanism for a tool result to select a per-page `ui://` resource.
4. **Comment delivery.** Agents poll `comments_list`. Push delivery depends on the harness and is not specified.
