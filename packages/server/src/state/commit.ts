import { commitLimitProblem, commitProblem, type StateCommitParams, type StateCommitResult, type StateLimits } from "@agentpages/protocol";
import type { Principal } from "../access/principal.js";
import { type Context, type Handler, mutation, ok, type Outcome, refuse } from "../pipeline/index.js";
import { grown, type Planned } from "../trees/check.js";
import { type Fitting, misfit, UNTYPED } from "../types/conform.js";
import type { Tx } from "@agentpages/storage";
import { applied, stale } from "./apply.js";
import { readBefore } from "./records.js";
import { saveCommit } from "./save.js";
import { type Arrival, remembered, scopeOf, toChange, type Within } from "./scope.js";

type Committing = Context<StateCommitParams, Within>;

/** A typed page checks what is put into its page scope. A viewer's own scope holds whatever the viewer puts there. */
const fitting = ({ deps, params, target }: Committing): Fitting[] =>
  params.scope === "page" ? [{ page: target.page, ops: params.ops, checks: deps.checks }] : [];

interface Making {
  context: Committing;
  whole: Planned;
}

const made = async (tx: Tx, { context, whole }: Making): Promise<Outcome<StateCommitResult>> => {
  const { params, principal, target, at, deps } = context;
  const by = await deps.actors.actorOf({ principal, pageId: target.page.info.pageId });
  const commit = applied(whole.plan, { opId: params.opId, at, by });
  saveCommit(tx, { whole, commit });
  return ok({ commit });
};

/**
 * Sections 2.1 and 4.2 of the spec, in the order of their decisions: what the type does not allow, more changes than
 * `maxOpsPerCommit`, a document placed deeper than `maxTreeDepth`, a condition that no longer holds, a broken tree.
 */
const commit =
  (limits: StateLimits) =>
  async (context: Committing, tx: Tx): Promise<Outcome<StateCommitResult>> => {
    const [typed = UNTYPED] = await Promise.all(fitting(context).map((checked) => misfit(tx, checked)));
    if (typed.wrong !== undefined) return refuse(typed.wrong);
    const grove = { scope: context.target.scope, trees: typed.trees };
    const before = await readBefore(tx, { scope: grove.scope, ops: context.params.ops });
    const whole = await grown(tx, { ...limits, grove, before });
    if (!whole.ok) return whole;
    const wrong = whole.value.blame("LimitExceeded") ?? stale(before) ?? whole.value.blame("Conflict");
    return wrong === undefined ? made(tx, { context, whole: whole.value }) : refuse(wrong);
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
