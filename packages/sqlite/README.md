# @agentpages/sqlite

A `Storage` of [@agentpages/storage](../storage/README.md) that keeps a Store in one SQLite file. It uses `node:sqlite`, so it needs Node 22.16 or later and builds nothing.

```ts
import { openSqliteStorage } from "@agentpages/sqlite";

const storage = openSqliteStorage({ path: "pages.sqlite", clock, leaseMs: 30_000, retryMs: 50 });
```

Every process on one machine that opens the file shares the storage. `openSqliteStorage` creates the file when it does not exist, and throws when the file is not a storage of this version: not a database, a database of another program, or another version. It leaves such a file as it is. `close` closes the file.

## How it works

- The file is in WAL mode. The commit of a run is synced to disk before `transact` resolves. The steps of the queue are not synced: a power loss may undo them, and then the lease frees the locks.
- A JSON object is saved as text and bytes as a blob. A row that holds anything else is not read. Keys are compared byte by byte, and a prefix is a range of keys, so `%` and `_` stand for themselves.
- Each read is one statement. A run holds no SQLite transaction: its writes are kept in memory and saved in one transaction at its end.
- Locks are a queue in the database. A run takes a ticket with its lock keys, and waits while a ticket before it has one of them. It looks again when a run of its own connection ends, and every `retryMs` for the runs of other connections.
- A ticket lasts `leaseMs` after the last step of its run, by the `clock`, so the locks of a process that died become free. A ticket number is never used again, so a run whose ticket is gone when it ends rejects and saves nothing. Choose a `leaseMs` longer than any run takes.
- All processes that open the file need one clock.
- A step that cannot get the write lock of the file within `leaseMs` rejects.
- A run that fails gives its ticket back. A ticket that cannot be given back lasts until its lease ends, and `transact` rejects with both errors.
- No test covers a power loss. The sync settings are checked by review.

## Where things are

| Folder | What it holds |
|---|---|
| `database` | The schema, and a write transaction |
| `rows` | The reads, and the writes of a run |
| `locks` | The queue of tickets, and the runs of this connection that wait |
| `storage` | `openSqliteStorage` |
