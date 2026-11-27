---
"@agentpages/protocol": minor
"@agentpages/server": minor
"@agentpages/conformance": minor
---

Add the first part of the Store. `createStore` answers the pages and types tools and the host operation `pages_open` over six ports: storage, clock, ids, logger, rate limiter and schema compiler. It comes with a memory storage and an Ajv schema compiler. The protocol gains the `maxSchemaBytes` limit with `schemaProblem`, the `Opened` type, and the host operations with their schemas. The new conformance package holds the tests every Store and storage adapter must pass, and a storage decorator that fails where a test says.
