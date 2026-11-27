---
"@agentpages/protocol": minor
"@agentpages/storage": minor
"@agentpages/server": minor
"@agentpages/conformance": minor
"@agentpages/sqlite": minor
---

Add `@agentpages/sqlite`, a storage adapter that keeps a Store in one SQLite file through `node:sqlite`. Its locks are a queue of tickets in the database with a lease, so they hold across processes and a process that died frees them. `Clock` moves from the server to `@agentpages/storage`, which now says that a value is saved as it is when `put` is called. `storageSuite` gains the cases of copied values, and the conformance package gains `across`, which runs a suite over several connections, and `durableSuite` for a storage that several processes open. A `cursor` is printable ASCII, as the keys of a storage are: `PagingSchema` refuses any other, and the protocol gains `CURSOR_PATTERN`.
