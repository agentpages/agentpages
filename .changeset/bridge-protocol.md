---
"@agentpages/protocol": minor
"@agentpages/server": patch
---

Add what the page bridge is built on. `createPeer` is one end of a JSON-RPC 2.0 conversation over a `Port` and `Timers`: it matches answers to requests by `id`, resolves `timeout` after `timeoutMs` and `closed` on close, and drops what is not JSON-RPC (`JsonRpcMessageSchema`). `InitializeResultSchema`, `MCP_APPS_VERSION` and the method names are the MCP Apps handshake as agentpages uses it. `indexBetween` makes a tree `index` between two siblings, and `retryWaitMs` the wait before a retry.

`HostRequest` and `ViewRequest` are a request to a Store without its principal. The `HostCall` and `ViewCall` of `@agentpages/server` extend them and are otherwise unchanged.

The spec says which MCP Apps messages a host of a page sends, which `protocolVersion`, how often it pings, and how JSON-RPC ids and malformed messages are treated.
