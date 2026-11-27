import { METHOD_SCHEMAS, type StateLimits, type StateMethods, TOOL_SCHEMAS, type ToolsOf } from "@agentpages/protocol";
import type { Agent } from "../access/principal.js";
import { existingPage, shownPage } from "../pages/target.js";
import type { Handler, Shown } from "../pipeline/index.js";
import { stateCommit } from "./commit.js";
import { stateCommits } from "./commits.js";
import { stateGet } from "./get.js";
import { stateList } from "./list.js";

type StateTools = ToolsOf<StateMethods>;

export type StateToolHandlers = {
  readonly [T in keyof StateTools]: Handler<StateTools[T]["params"], StateTools[T]["result"], Agent>;
};

export type StateMethodHandlers = {
  readonly [M in keyof StateMethods]: Shown<StateMethods[M]["params"], StateMethods[M]["result"]>;
};

/** Section 5.3 of the spec: each state method as a tool of an agent, which names its page by `pageId`. */
export const stateTools = (limits: StateLimits): StateToolHandlers => ({
  state_get: stateGet({ schemas: TOOL_SCHEMAS.state_get, page: existingPage }),
  state_list: stateList({ schemas: TOOL_SCHEMAS.state_list, page: existingPage }),
  state_commit: stateCommit(limits)({ schemas: TOOL_SCHEMAS.state_commit, page: existingPage }),
  state_commits: stateCommits({ schemas: TOOL_SCHEMAS.state_commits, page: existingPage }),
});

/** Section 4.1 of the spec: each state method of a view, whose page is the one its link names. */
export const stateMethods = (limits: StateLimits): StateMethodHandlers => ({
  "agentpages/state/get": (url) => stateGet({ schemas: METHOD_SCHEMAS["agentpages/state/get"], page: shownPage(url) }),
  "agentpages/state/list": (url) => stateList({ schemas: METHOD_SCHEMAS["agentpages/state/list"], page: shownPage(url) }),
  "agentpages/state/commit": (url) =>
    stateCommit(limits)({ schemas: METHOD_SCHEMAS["agentpages/state/commit"], page: shownPage(url) }),
  "agentpages/state/commits": (url) =>
    stateCommits({ schemas: METHOD_SCHEMAS["agentpages/state/commits"], page: shownPage(url) }),
});
