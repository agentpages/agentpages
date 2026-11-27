# @agentpages/protocol

The types, validators and constants of the [agentpages protocol](../../spec/agentpages.md). Every other package imports them from here.

## Validate a request

```ts
import { failure, invalidParams, METHOD_SCHEMAS, commitProblem, validate } from "@agentpages/protocol";

const params = validate(METHOD_SCHEMAS["agentpages/state/commit"].params, input);
if (!params.ok) return invalidParams({ requestId, issues: params.issues });

const problem = commitProblem({ ops: params.value.ops, limits: capability.state });
if (problem) return failure({ ...problem, requestId });
```

`validate` checks a value against a schema and returns it typed. Rules that depend on a Store's limits are separate checks that take those limits: `commitProblem`, `fileProblem`, `htmlProblem` and `viewportProblem`.

## Look up a method or a tool

`METHODS` and `TOOLS` say which feature a method or tool needs, who receives it and whether it changes anything. `METHOD_SCHEMAS` and `TOOL_SCHEMAS` hold the validators. Import only the first pair and a bundler leaves the validators out.

## Report a failure

`failure` builds a `Failure` with the `retryable` the spec gives its error. `toJsonRpcError` and `toToolError` turn it into what a view method and a Store tool return. `fromJsonRpcError` reads it back.

## Schemas

Schemas are [Valibot](https://valibot.dev) schemas. JSON objects the protocol does not interpret, and maps keyed by id, are custom schemas: when converting to JSON Schema, map them to `{ "type": "object" }`.
