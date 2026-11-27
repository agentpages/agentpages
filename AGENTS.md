# Working on agentpages

The standard for every change, whether a person or an agent writes it. Principles are adapted from [pstack](https://github.com/cursor/plugins) (MIT).

## Sources of truth

| Fact | Lives in |
|---|---|
| Wire protocol and behavior | [spec/agentpages.md](spec/agentpages.md) |
| What the project is, package map | [README.md](README.md) |
| How we work | this file |
| Why a change was made | the pull request description |

A fact is written once. Link to it; do not restate it.

## Design rules

1. **Spec first.** Behavior changes land in the spec before or with the code. Code that disagrees with the spec is a bug.
2. **One way per task.** One owner per piece of state, one API per job. No second path "just in case".
3. **No fallbacks.** No guards, retries, swallowed errors or defaults that hide a state the design says cannot happen. If a workaround seems necessary, the design is wrong: redesign it.
4. **Fix root causes.** A change integrates as if it had been there from day one. No compatibility shims, no throwaway intermediate states.
5. **Data shapes before logic.** Make illegal states unrepresentable in types. Validate at package boundaries, trust types inside.
6. **Subtract before adding.** Prefer the smallest diff, and deletion over addition.
7. **Safe retries.** Retrying a request never duplicates its effect. Callers choose ids.
8. **Self-documenting code.** Small functions with plain names. No comments except public API docs and links to an external constraint. No lint or type suppressions.
9. **Prove it works.** A test states a requirement from the spec and checks it through a package's public API. It must fail when the behavior breaks and survive a rewrite of the internals. No tests of private functions, no mocks of our own packages, no assertions that restate the implementation. "It compiles" is not evidence.

## Rules and their enforcers

A rule that has been broken twice gets an enforcer: a type first, then a lint rule or check, then a test. Prose is the last resort.

| Rule | Enforcer |
|---|---|
| Package layering | `pnpm lint:deps` |
| No unused code or dependencies | `pnpm lint:unused` |
| Strict types, no suppressions | `pnpm typecheck`, `pnpm lint` |
| Packages resolve for every consumer | `pnpm lint:packages` |
| Bundle budgets | `pnpm size` |
| Behavior | `pnpm test` |
| Tests import only a package's entry point | `pnpm lint:deps` |
| Design rules 1 to 8 | review |

`pnpm check` runs all of them, locally and in CI.

## Roles

- **Owner** decides architecture, writes the spec, splits work into independently verifiable units, and re-runs every claim before accepting it.
- **Workers** implement one unit each from a brief that states the goal, the files in scope and what done looks like.
- **Reviewers** get the intent and the diff, never the author's conclusions. A finding counts only with a command or test that demonstrates it.

## Pull requests

1. One logical change, with tests, passing `pnpm check`.
2. `pnpm changeset` for any change to a published package.
3. Description, 250 words at most: what it does in one or two lines, then the decisions (why this approach, what was rejected and why).

## Writing

Plain, short sentences. One name per concept. No filler, no summaries that repeat the text above them.
