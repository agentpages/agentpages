---
"@agentpages/server": minor
"@agentpages/conformance": minor
---

Add state and identity to the Store, without trees. The Store answers `state_get`, `state_list`, `state_commit` and `state_commits`, and gains `view`, which answers the same four as methods of a view, and `identity/get`, for the page behind the link the host holds. A commit to the page scope of a typed page is checked against the schemas of its type version. `pages_publish` refuses a change of a page's kind or `typeId`, and `types_publish` decides a change of what is a tree before a stale `baseVersion`. A tool or method exists exactly when the Store advertises its feature. The conformance `Driver` gains `view`, a viewer can have a `name`, and `storeSuite` gains the cases of state, identity and typed pages, with one that plays random commits against a model.
