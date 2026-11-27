# @agentpages/storage

The storage port of a Store of the [agentpages protocol](../../spec/agentpages.md): `Key`, `Value`, `Range`, `Reader`, `Tx` and `Storage`. It also holds `Clock`, the time as a Store and a storage adapter read it. It holds types only and depends on nothing.

`@agentpages/server` runs on a `Storage`, and `storageSuite` of [@agentpages/conformance](../conformance/README.md) tests one. A new database is a new implementation of `Storage`, as [@agentpages/sqlite](../sqlite/README.md) is.
