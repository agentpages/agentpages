# agentpages

Open runtime for agent-made pages: render model-written HTML in a sandboxed iframe and give it a bridge for storage, viewer identity, model calls and files. Built as extensions on top of [MCP Apps](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp), so it works with any agent, harness or frontend.

> Status: scaffold. Packages are placeholders; nothing is published.

## Packages

| Package | Role | May depend on |
|---|---|---|
| `@agentpages/protocol` | Wire protocol types and validators | nothing |
| `@agentpages/client` | Page-side bridge inside the iframe | protocol |
| `@agentpages/host` | Framework-free host runtime | protocol |
| `@agentpages/react` | React bindings | host |
| `@agentpages/server` | Web-standard handler and adapter ports | protocol |
| `@agentpages/mcp` | MCP server for agents | server |

The dependency column is enforced by `pnpm lint:deps`.

## Develop

```bash
pnpm install
pnpm check
```

`pnpm check` runs every gate CI runs: build, typecheck, lint, tests, `publint`, `arethetypeswrong`, dependency rules, `knip` and size budgets.

## License

Apache-2.0
