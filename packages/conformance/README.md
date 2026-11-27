# @agentpages/conformance

The tests every Store and every storage adapter of the [agentpages protocol](../../spec/agentpages.md) must pass. They are written once and run against each implementation. The package depends on the protocol and on [@agentpages/storage](../storage/README.md), the port a storage adapter implements.

## Test a storage

```ts
import { storageSuite } from "@agentpages/conformance";

storageSuite(() => createMyStorage());
```

`storageSuite` registers Vitest tests for the storage contract: writes that are saved together or not at all, reads that see only committed rows, the order of a scan, and runs that are serial per lock key. The function returns a new, empty storage each time.

## Test a Store

```ts
import { storeSuite } from "@agentpages/conformance";

storeSuite(() => ({ capability, call, host, view, advance }));
```

`storeSuite` registers the tests of a Store behind a `Driver`. It reads the `capability` of the first driver when the tests are registered, so the function that makes a driver is not async. Every Store gets the core cases. For `state` and for `identity` it gets the cases of the feature, or the cases that say the feature is not there. `call` is a tool call of the agent with a given subject. `host` is an operation for a viewer, who is a subject when signed in, under the `requestId` the suite chose as their host. The link a viewer presents is in the input. `view` is a method a view calls: its `url` is the link the host holds for the view, beside the params. `advance` moves the Store's clock. Every title starts with the tag of the requirement it proves.

The core cases of comments start threads through `host`, as a host does for a viewer, and fill a thread up to `maxThreadEntries`. They need a `maxThreadEntries` of at least 3. The cases of `pages_heads` are core cases too, and a Store with `state` gets one more for `seq` and `viewerSeq`.

The cases of `state` read `maxOpsPerCommit` and `maxTreeDepth` from the capability and reach both exactly. They need a `maxOpsPerCommit` of at least 5 and a `maxTreeDepth` of at least 4, and commit more documents the larger the two are.

## How the suites are written

The suites are mutation tested like any other code, so nothing in them is there for show:

- A case returns what it got and what the spec wants, and the suite compares the two in its one assertion. Run Vitest with `expect.requireAssertions`, so that a test which asserts nothing fails.
- Requests come from the builders in `kit.ts`, and a request that must fail is a valid one with a single field changed.
- A state case is written once against a `Surface`, and runs through the tools of an agent and through the methods of a view. No state case needs `identity`: who a viewer is comes from a commit in their own scope.
- A core case uses no feature, so it runs against every Store.
- One case plays random commits and reads against a model of three logs, whose page scope has a tree. Each run starts with a tree, then moves and deletes its documents, puts some under what a delete takes along, and tries cycles. At the end it deletes every root, which must change exactly the documents the Store lists. What a delete takes along is what is left without a parent in the tree after the ops, not what a walk down from the deleted document finds. Its runs come from `rng`, a small seeded generator in `kit.ts`, so they are the same every time. A checksum of them is pinned: a change of the generator fails the case until someone has looked at what the new runs reach.
- A case holds no step that only a broken Store would notice. Such probes, and everything that needs more than a `Driver` (restarts, faults, logs, rate limits), are tests of the implementation and live with it.

## Make a storage fail

```ts
import { faulty } from "@agentpages/conformance";

const storage = faulty(createMyStorage(), (point) => {
  if (point === "committed") throw new Error("The connection dropped.");
});
```

`faulty` wraps a storage. The plan is asked at every read, before a transaction commits (`commit`) and after (`committed`). It gets the point, then the keys and the locks of the call. Throw to fail there, or return a promise to hold the storage there, which is how a test interleaves requests.
