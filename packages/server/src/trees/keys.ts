import type { Key } from "@agentpages/storage";
import type { DocumentId } from "../state/keys.js";

/** A tree document that is not a root. */
export interface Child extends DocumentId {
  parent: string;
}

/** What the key of every child of a tree document starts with. The children are in the order of their ids. */
export const childrenPrefix = (scope: Key, { collection, id }: DocumentId): Key => `${scope}t/${collection}/${id}/`;

/** That a tree document is a child of its parent. */
export const childKey = (scope: Key, { collection, id, parent }: Child): Key =>
  `${childrenPrefix(scope, { collection, id: parent })}${id}`;
