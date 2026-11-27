# @agentpages/sqlite

A `Storage` of [@agentpages/storage](../storage/README.md) that keeps a Store in one SQLite file. It uses `node:sqlite`, so it needs Node 22.16 or later and builds nothing.

```ts
import { openSqliteStorage } from "@agentpages/sqlite";

const storage = openSqliteStorage({ path: "pages.sqlite", clock, leaseMs: 30_000, retryMs: 50 });
```

Every process on one machine that opens the file shares the storage. `openSqliteStorage` creates the file when it does not exist, and throws when the file is not a database or holds another version of the storage. `close` closes the file.

## How it works

- The file is in WAL mode and every commit is synced to disk before `transact` resolves.
- A JSON object is saved as text and bytes as a blob. Keys are compared byte by byte, and a prefix is a range of keys, so `%` and `_` stand for themselves.
- Each read is one statement. A run holds no SQLite transaction: its writes are kept in memory and saved in one transaction at its end.
- Locks are a queue in the database. A run takes a ticket with its lock keys, and waits while a ticket before it has one of them. It looks again when a run of its own connection ends, and every `retryMs` for the runs of other connections.
- A ticket lasts `leaseMs` after the last step of its run, by the `clock`, so the locks of a process that died become free. A run whose ticket is gone when it ends rejects and saves nothing. Choose a `leaseMs` longer than any run takes.
- A step that cannot get the write lock of the file within `leaseMs` rejects.

## Where things are

| Folder | What it holds |
|---|---|
| `database` | The schema, and a write transaction |
| `rows` | The reads, and the writes of a run |
| `locks` | The queue of tickets, and the runs of this connection that wait |
| `storage` | `openSqliteStorage` |
