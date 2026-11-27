---
"@agentpages/protocol": minor
"@agentpages/server": minor
"@agentpages/conformance": minor
---

Add trees to the Store. In the page scope of a typed page, a put into a tree collection must be a tree node, a commit that would leave a tree document it puts with a missing parent, or one it places as its own ancestor, is a `Conflict`, and a delete takes the descendants of its document along, each as a change after it, depth first and siblings by `id`. A commit whose changes number more than `maxOpsPerCommit`, or that places a document under more than `maxTreeDepth` ancestors, is beyond the limit, and reads no more of the tree than those limits. The `state` capability gains `maxTreeDepth`. A collection is a tree when any version of its type declared it one. `storeSuite` gains the cases of trees and of their limits, and its model has a tree in the page scope.
