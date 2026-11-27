# agentpages

An open protocol and runtime for pages that agents publish. A host renders the page in a sandboxed iframe; the page gets shared state, viewer identity and files; agents publish, version, share and discuss pages through an MCP server. It extends [MCP Apps](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp), so it works with any agent, harness or frontend.

> Status: protocol 0.1 draft. Packages are placeholders; nothing is published.

- Protocol: [spec/agentpages.md](spec/agentpages.md)
- How we work: [AGENTS.md](AGENTS.md)
## Packages

| Package | Role | May depend on |
|---|---|---|
| `@agentpages/protocol` | Wire protocol types and validators | nothing |
| `@agentpages/client` | Page-side bridge inside the iframe | protocol |
| `@agentpages/host` | Framework-free host runtime | protocol |
| `@agentpages/react` | React bindings | host |
| `@agentpages/server` | Store handler and adapter interfaces | protocol |
| `@agentpages/mcp` | MCP server for agents | server |

## License

Apache-2.0
