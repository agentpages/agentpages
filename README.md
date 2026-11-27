# agentpages

An open protocol and runtime for pages that agents publish. A host renders the page in a sandboxed iframe; the page gets shared state, viewer identity and files; agents publish, version, share and discuss pages through an MCP server. It extends [MCP Apps](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp), so it works with any agent, harness or frontend.

> Status: protocol 0.1 draft. `@agentpages/protocol` implements its types, `@agentpages/server` the pages, types, state, trees, identity, files, comments and heads of a Store, and `@agentpages/sqlite` keeps a Store in a SQLite file, and `@agentpages/host` serves a view of a page from the host's side. The client, react and mcp packages are placeholders. Nothing is published.

- Protocol: [spec/agentpages.md](spec/agentpages.md)
- How we work: [AGENTS.md](AGENTS.md)

## Packages

| Package | Role | May depend on |
|---|---|---|
| `@agentpages/protocol` | Wire protocol types and validators | nothing |
| `@agentpages/storage` | The storage port of a Store, as types | nothing |
| `@agentpages/client` | Page-side bridge inside the iframe | protocol |
| `@agentpages/host` | Framework-free host runtime | protocol |
| `@agentpages/react` | React bindings | host |
| `@agentpages/server` | The Store: its behavior, its ports and two adapters | protocol, storage |
| `@agentpages/sqlite` | A storage adapter that keeps a Store in a SQLite file | storage |
| `@agentpages/conformance` | Tests that every Store and storage adapter must pass | protocol, storage |
| `@agentpages/mcp` | MCP server for agents | server |

## License

Apache-2.0
