# @agentpages/protocol

The types, validators and constants of the [agentpages protocol](../../spec/agentpages.md). Every other package imports them from here.

## Validate a request

```ts
import { commitLimitProblem, commitProblem, failure, invalidParams, TOOL_SCHEMAS, validate } from "@agentpages/protocol";

const params = validate(TOOL_SCHEMAS.state_commit.params, input);
if (!params.ok) return invalidParams({ requestId, issues: params.issues });

const malformed = commitProblem({ ops: params.value.ops, limits: capability.state });
if (malformed) return failure({ ...malformed, requestId });
```

`validate` checks a value against a schema. Its `value` leaves out every field the spec does not know and keeps document data, CSP, permissions and JSON Schemas exactly as they came. An issue says what was expected and where, never what was received.

Rules that depend on a Store's limits are separate checks that take those limits. `commitProblem` belongs to the first check of a request. `commitLimitProblem`, `fileProblem`, `htmlProblem` and `viewportProblem` belong to the last.

`toBase64` and `fromBase64` turn the bytes of a file into its `blob` and back. `pageResourceUri` names the MCP resource of an html version, and `pageOfResourceUri` reads it back.

## Schemas

A `Schema<T>` is a [Standard Schema](https://standardschema.dev), so it works wherever one is accepted. `toolInputSchema(tool)` is the JSON Schema a Store advertises as a tool's `inputSchema`: one object, as MCP requires. In it, JSON objects the protocol does not interpret and maps keyed by id are plain objects, and a `blob` is a string with `contentEncoding: "base64"`: a pattern for canonical base64 would not be safe on a large file. `isBase64` is the check, in linear time.

## Look up a method or a tool

`METHODS` and `TOOLS` say which feature a method or tool needs, who receives it and whether it changes anything. `METHOD_SCHEMAS` and `TOOL_SCHEMAS` hold the validators. `TOOL_DESCRIPTIONS` is what a Store tells an agent about each tool: what it does, how to choose its ids, and how to repeat a call. Import only the first pair and a bundler leaves the validators out; `pnpm size` checks that.

## Report a failure

`failure` builds a `Failure` with the `retryable` the spec gives its error. `toJsonRpcError` and `toToolError` turn it into what a view method and a Store tool return. `fromJsonRpcError` reads it back.

## Speak to the other side of the iframe

`createPeer` is one end of the JSON-RPC conversation between a view and its host, over a `Port` and `Timers` its caller supplies: it matches answers to requests, resolves `timeout` or `closed` in place of one, and drops what is not JSON-RPC. `InitializeResultSchema` reads the `ui/initialize` result of a host that advertises agentpages. `indexBetween` makes the `index` of a tree document placed between two siblings, and `retryWaitMs` the wait before a retry.
