---
"@agentpages/server": minor
"@agentpages/conformance": minor
---

Add trees to the Store. In the page scope of a typed page, a put into a tree collection must be a tree node, a commit that would leave a tree document with a missing parent or in a cycle is a `Conflict`, and a delete takes the descendants of its document along, each as a change after it, a parent before its children and siblings by `id`. A commit whose changes number more than `maxOpsPerCommit` is beyond the limit. A collection is a tree when any version of its type declared it one. `storeSuite` gains the cases of trees, and its model has a tree in the page scope.
