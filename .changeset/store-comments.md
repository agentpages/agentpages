---
"@agentpages/server": minor
"@agentpages/conformance": minor
---

Add comments and `pages_heads` to the Store. `comments_list`, `comments_reply` and `comments_resolve` are tools of an agent, and with `comments_start` operations a host runs for a viewer by the `url` they present. Every Store has them: they are no feature. `pages_heads` returns the numbers a host polls to learn that a page, its state or its comments changed, with one read and no lock. A remembered reply or resolve keeps the size and status of its thread, not the thread. `storeSuite` gains the core cases of comments and heads, which start threads through `host` and need a `maxThreadEntries` of at least 3. The example `maxThreadEntries` of the spec is now 100.
