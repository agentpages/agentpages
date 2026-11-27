import { type Commit, commitLimitProblem, commitProblem, type Problem, type StateCommitParams, type StateCommitResult, type StateLimits } from "@agentpages/protocol";
import type { Principal } from "../access/principal.js";
import { type Context, type Handler, mutation, ok, type Outcome, refuse } from "../pipeline/index.js";
import { planned } from "../trees/check.js";
import { type Fitting, misfit, UNTYPED } from "../types/conform.js";
import type { Tx } from "@agentpages/storage";
import { applied, staleIndex } from "./apply.js";
import { type Before, readBefore } from "./records.js";
import { saveCommit } from "./save.js";
import { type Arrival, remembered, scopeOf, toChange, type Within } from "./scope.js";

type Committing = Context<StateCommitParams, Within>;

/** A typed page checks what is put into its page scope. A viewer's own scope holds whatever the viewer puts there. */
const fitting = ({ deps, params, target }: Committing): Fitting[] =>
  params.scope === "page" ? [{ page: target.page, ops: params.ops, checks: deps.checks }] : [];

/** Section 4.2 of the spec: the descendants a commit deletes count towards its size, which is decided last. */
const tooMany = ({ changes }: Commit, { maxOpsPerCommit }: StateLimits): Problem | undefined =>
  changes.length > maxOpsPerCommit
    ? { error: "LimitExceeded", message: `${changes.length} changes are more than maxOpsPerCommit ${maxOpsPerCommit}` }
    : undefined;

interface Growing {
  context: Committing;
  trees: ReadonlySet<string>;
  before: Before;
}

/** The commit of a request whose conditions hold: it is made when it leaves the trees of its scope whole. */
const grown =
  (limits: StateLimits) =>
  async (tx: Tx, { context, trees, before }: Growing): Promise<Outcome<StateCommitResult>> => {
    const { params, principal, target, at, deps } = context;
    const whole = await planned(tx, { grove: { scope: target.scope, trees }, before });
    if (!whole.ok) return whole;
    const by = await deps.actors.actorOf({ principal, pageId: target.page.info.pageId });
    const made = applied(whole.value.plan, { opId: params.opId, at, by });
    const beyond = tooMany(made, limits);
    if (beyond !== undefined) return refuse(beyond);
    saveCommit(tx, { whole: whole.value, commit: made });
    return ok({ commit: made });
  };

const commit =
  (limits: StateLimits) =>
  async (context: Committing, tx: Tx): Promise<Outcome<StateCommitResult>> => {
    const [typed = UNTYPED] = await Promise.all(fitting(context).map((checked) => misfit(tx, checked)));
    if (typed.wrong !== undefined) return refuse(typed.wrong);
    const before = await readBefore(tx, { scope: context.target.scope, ops: context.params.ops });
    const opIndex = staleIndex(before);
    if (opIndex !== -1) return refuse({ error: "Conflict", message: `The ifRevision of op ${opIndex} no longer holds.`, opIndex });
    return grown(limits)(tx, { context, trees: typed.trees, before });
  };

/** `state/commit` of a Store with these limits. */
export const stateCommit =
  (limits: StateLimits) =>
  <P extends StateCommitParams>(arrival: Arrival<P, StateCommitResult>): Handler<P, StateCommitResult, Principal> =>
    mutation(arrival.schemas, {
      target: scopeOf(arrival, toChange),
      remembers: remembered,
      malformed: ({ ops }) => commitProblem({ ops, limits }),
      limits: ({ ops }) => commitLimitProblem({ ops, limits }),
      created: (result) => ({ seq: result.commit.seq }),
      run: commit(limits),
    });
