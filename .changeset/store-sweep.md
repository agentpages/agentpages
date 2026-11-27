---
"@agentpages/server": minor
---

Add `sweep(limit)` to the Store. It clears up to `limit` remembered requests and up to `limit` commits that are `requestTimeoutMs` past their retention, and resolves with how many: 0 means nothing is past retention now. The deployment calls it on a timer. `state/commits` answers `ResyncRequired` when a commit it would return was deleted.
