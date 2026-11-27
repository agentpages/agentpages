import { commitLimitProblem, commitProblem, type StateCommitParams, type StateCommitResult, type StateLimits } from "@agentpages/protocol";
import { actorOf } from "../access/actor.js";
import type { Principal } from "../access/principal.js";
import { type Context, type Handler, mutation, ok, type Outcome, refuse } from "../pipeline/index.js";
import { type Fitting, misfit } from "../types/conform.js";
import type { Tx } from "@agentpages/storage";
import { applied, staleIndex } from "./apply.js";
import { readBefore } from "./records.js";
import { saveCommit } from "./save.js";
import { type Arrival, remembered, scopeOf, toChange, type Within } from "./scope.js";

/** A typed page checks what is put into its page scope. A viewer's own scope holds whatever the viewer puts there. */
const fitting = ({ deps, params, target }: Context<StateCommitParams, Within>): Fitting[] =>
  params.scope === "page" ? [{ page: target.page, ops: params.ops, compiler: deps.compiler }] : [];

const commit = async (context: Context<StateCommitParams, Within>, tx: Tx): Promise<Outcome<StateCommitResult>> => {
  const { params, principal, target, at } = context;
  const [wrong] = await Promise.all(fitting(context).map((checked) => misfit(tx, checked)));
  if (wrong !== undefined) return refuse(wrong);
  const before = await readBefore(tx, { scope: target.scope, ops: params.ops });
  const opIndex = staleIndex(before);
  if (opIndex !== -1) return refuse({ error: "Conflict", message: `The ifRevision of op ${opIndex} no longer holds.`, opIndex });
  const made = applied(before, { opId: params.opId, at, by: await actorOf(principal) });
  saveCommit(tx, { scope: target.scope, commit: made });
  return ok({ commit: made });
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
      run: commit,
    });
