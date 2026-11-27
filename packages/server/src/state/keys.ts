import { counted, segment } from "../pipeline/index.js";
import type { Key } from "@agentpages/storage";
import { pagePrefix } from "../pages/keys.js";

/** The document an op or a read names. */
export interface DocumentId {
  collection: string;
  id: string;
}

const statePrefix = (pageId: string): Key => `${pagePrefix(pageId)}s/`;

/** What every key of the page scope starts with. */
export const pageScope = (pageId: string): Key => `${statePrefix(pageId)}p/`;

/** What every key of one viewer's scope starts with. */
export const viewerScope = (pageId: string, subject: string): Key => `${statePrefix(pageId)}v/${segment(subject)}/`;

/** The `seq` of the last commit of a scope. */
export const headKey = (scope: Key): Key => `${scope}head`;

/** The live documents of a collection, in the order `list` returns them. */
export const documentsPrefix = (scope: Key, collection: string): Key => `${scope}d/${collection}/`;

export const documentKey = (scope: Key, { collection, id }: DocumentId): Key => `${documentsPrefix(scope, collection)}${id}`;

/** The revision counter of a document. It is never deleted, so the count never resets. */
export const revisionKey = (scope: Key, { collection, id }: DocumentId): Key => `${scope}r/${collection}/${id}`;

export const logPrefix = (scope: Key): Key => `${scope}l/`;

/** One commit of a scope's log. */
export const logKey = (scope: Key, seq: number): Key => `${logPrefix(scope)}${counted(seq)}`;
