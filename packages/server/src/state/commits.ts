import { type Commit, DEFAULT_LIMIT, type StateCommitsParams, type StateCommitsResult } from "@agentpages/protocol";
import type { Principal } from "../access/principal.js";
import { type Context, type Handler, ok, type Outcome, parsed, query, refuse } from "../pipeline/index.js";
import type { Tx } from "@agentpages/storage";
import { logKey, logPrefix } from "./keys.js";
import { seqOf } from "./records.js";
import { type Arrival, scopeOf, toRead, type Within } from "./scope.js";

const MS_PER_SECOND = 1000;

type Following<P> = Context<P, Within>;

/** Section 4.1 of the spec: a commit is kept while it is at most `commitRetentionSeconds` old, whatever the storage holds. */
const isKept = ({ at, deps }: Following<unknown>, commit: Commit): boolean =>
  Date.parse(at) - Date.parse(commit.at) <= deps.capability.limits.commitRetentionSeconds * MS_PER_SECOND;

const follow =
  <P extends StateCommitsParams>({ schemas }: Arrival<P, StateCommitsResult>) =>
  async (context: Following<P>, tx: Tx): Promise<Outcome<StateCommitsResult>> => {
    const { since, limit = DEFAULT_LIMIT } = context.params;
    const { scope } = context.target;
    const seq = await seqOf(tx, scope);
    if (since > seq) return refuse({ error: "InvalidParams", message: `since ${since} is beyond the current seq ${seq}.` });
    const rows = await tx.scan({ prefix: logPrefix(scope), after: logKey(scope, since), limit });
    const followed = parsed(schemas.result, { commits: rows.map(([, stored]) => stored), seq });
    return followed.commits.every((kept) => isKept(context, kept))
      ? ok(followed)
      : refuse({ error: "ResyncRequired", message: `The log no longer reaches since ${since}. List again.` });
  };

export const stateCommits = <P extends StateCommitsParams>(arrival: Arrival<P, StateCommitsResult>): Handler<P, StateCommitsResult, Principal> =>
  query(arrival.schemas, { target: scopeOf(arrival, toRead), run: follow(arrival) });
