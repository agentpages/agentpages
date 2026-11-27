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

storeSuite(() => ({ capability, call, host, advance }));
```

`storeSuite` registers the tests of a Store behind a `Driver`. `call` is a tool call of the agent with a given subject. `host` is an operation for a viewer, who is a subject when signed in, under the `requestId` the suite chose as their host. The link a viewer presents is in the input. `advance` moves the Store's clock. Every title starts with the tag of the requirement it proves.

## How the suites are written

The suites are mutation tested like any other code, so nothing in them is there for show:

- A case returns what it got and what the spec wants, and the suite compares the two in its one assertion. Run Vitest with `expect.requireAssertions`, so that a test which asserts nothing fails.
- Requests come from the builders in `kit.ts`, and a request that must fail is a valid one with a single field changed.
- A case holds no step that only a broken Store would notice. Such probes, and everything that needs more than a `Driver` (restarts, faults, logs, rate limits), are tests of the implementation and live with it.

## Make a storage fail

```ts
import { faulty } from "@agentpages/conformance";

const storage = faulty(createMyStorage(), (point) => {
  if (point === "committed") throw new Error("The connection dropped.");
});
```

`faulty` wraps a storage. The plan is asked at every read, before a transaction commits (`commit`) and after (`committed`). It gets the point, then the keys and the locks of the call. Throw to fail there, or return a promise to hold the storage there, which is how a test interleaves requests.
