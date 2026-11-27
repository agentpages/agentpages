import type { Commit, Document, Op, Scope } from "./types.js";

export interface StateGetParams {
  scope: Scope;
  collection: string;
  id: string;
}

export interface StateGetResult {
  document: Document | null;
}

export interface StateListParams {
  scope: Scope;
  collection: string;
  cursor?: string;
  limit?: number;
}

export interface StateListResult {
  documents: Document[];
  seq: number;
  nextCursor?: string;
}

export interface StateCommitParams {
  scope: Scope;
  opId: string;
  ops: Op[];
}

export interface StateCommitResult {
  commit: Commit;
}

export interface StateCommitsParams {
  scope: Scope;
  since: number;
  limit?: number;
}

export interface StateCommitsResult {
  commits: Commit[];
  seq: number;
}

export interface StateMethods {
  "agentpages/state/get": { params: StateGetParams; result: StateGetResult };
  "agentpages/state/list": { params: StateListParams; result: StateListResult };
  "agentpages/state/commit": { params: StateCommitParams; result: StateCommitResult };
  "agentpages/state/commits": { params: StateCommitsParams; result: StateCommitsResult };
}
