---
"@agentpages/protocol": minor
"@agentpages/server": minor
---

Add what files, comments and heads need to the spec and the protocol. A host names a page by the `url` its viewer presented: `comments_start` takes `url` in place of `pageId`, and `comments_list`, `comments_reply` and `comments_resolve` are host operations that do the same. The new host operation `pages_heads` returns `Heads`, the numbers a host compares to learn that a page, its state or its comments changed. `limits` gains `maxThreadEntries`, which every capability must now carry. `toBase64` and `fromBase64` turn bytes into the base64 of the spec and back, and `fromBase64` throws on text that is not canonical. `PagesOpenParams` is now `Presented`. The Store answers the new host operations with `unknown-method` until it has them.
