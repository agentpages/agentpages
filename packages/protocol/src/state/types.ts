export type Scope = "page" | "viewer";

export type Actor = { kind: "viewer"; id: string } | { kind: "anonymous" } | { kind: "agent" };

export interface Document {
  collection: string;
  id: string;
  data: Record<string, unknown>;
  revision: number;
  updatedAt: string;
  updatedBy: Actor;
}

export type Op =
  | { op: "put"; collection: string; id: string; data: Record<string, unknown>; ifRevision?: number }
  | { op: "delete"; collection: string; id: string; ifRevision?: number };

export interface Change {
  collection: string;
  id: string;
  revision: number;
  document: Document | null;
}

export interface Commit {
  seq: number;
  opId: string;
  at: string;
  by: Actor;
  changes: Change[];
}

export interface Committed {
  scope: Scope;
  commit: Commit;
}
