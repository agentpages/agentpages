import {
  type Answer,
  type Commit,
  type Heads,
  HOST_OPERATION_SCHEMAS,
  METHOD_SCHEMAS,
  type Scope,
  validate,
} from "@agentpages/protocol";
import type { HostEvent } from "../types.js";

/** What one `pages_heads` answer means for a view that shows `version`: the poll ends, or goes on with these heads. */
export type Read = { kind: "end"; event: HostEvent } | { kind: "heads"; heads: Heads };

/** Where one scope stands: `since` is the last `seq` the view was sent, `head` the one the Store is at. */
export interface Position {
  scope: Scope;
  since: number;
  head: number;
}

/** The commits to send the view, and the `seq` it was sent last once they are posted. */
export interface Fetched {
  commits: Commit[];
  cursor: number;
}

const readFailure = (error: string): Read | undefined =>
  error === "NotFound" || error === "Forbidden" ? { kind: "end", event: { kind: "closed", error } } : undefined;

const readHeads = (result: unknown, version: number): Read | undefined => {
  const heads = validate(HOST_OPERATION_SCHEMAS.pages_heads.result, result);
  if (!heads.ok) return undefined;
  return heads.value.version === version
    ? { kind: "heads", heads: heads.value }
    : { kind: "end", event: { kind: "version", version: heads.value.version } };
};

/** Nothing when the answer says nothing of the page: a failure that does not close it, or what is no `Heads`. */
export const readAnswer = (answer: Answer, version: number): Read | undefined => {
  if (answer.kind === "result") return readHeads(answer.result, version);
  return answer.kind === "failure" ? readFailure(answer.failure.error) : undefined;
};

const headsByScope = ({ seq, viewerSeq }: Heads): [Scope, number][] =>
  viewerSeq === undefined ? [["page", seq]] : [["page", seq], ["viewer", viewerSeq]];

/** The position of every scope the heads name. A scope seen for the first time starts at its head (HOST-8). */
export const positionsOf = (heads: Heads, sent: ReadonlyMap<Scope, number>): Position[] =>
  headsByScope(heads).map(([scope, head]) => ({ scope, head, since: sent.get(scope) ?? head }));

const fetchedCommits = ({ since }: Position, result: unknown): Fetched => {
  const page = validate(METHOD_SCHEMAS["agentpages/state/commits"].result, result);
  const commits = page.ok ? page.value.commits : [];
  return { commits, cursor: commits.at(-1)?.seq ?? since };
};

/** What a `commits` answer gives the view. `ResyncRequired` skips to the head, any other failure changes nothing. */
export const fetchedOf = (position: Position, answer: Answer): Fetched => {
  if (answer.kind === "result") return fetchedCommits(position, answer.result);
  const resync = answer.kind === "failure" && answer.failure.error === "ResyncRequired";
  return { commits: [], cursor: resync ? position.head : position.since };
};
