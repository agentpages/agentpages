# Contributing

1. `pnpm install`
2. Make your change with a test.
3. `pnpm check` must pass.
4. `pnpm changeset` to describe any change to a published package.

Package boundaries are listed in the README and enforced by `.dependency-cruiser.cjs`. Changes to the wire protocol need a version bump in `@agentpages/protocol`.
