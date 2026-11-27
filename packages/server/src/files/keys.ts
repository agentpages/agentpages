import type { Key } from "@agentpages/storage";
import { pagePrefix } from "../pages/keys.js";

/** The file a request names, on its page. */
export interface FileOf {
  pageId: string;
  id: string;
}

const filesPrefix = (pageId: string): Key => `${pagePrefix(pageId)}f/`;

/** The `FileInfo` of every file of a page, in the order `list` returns them. */
export const infosPrefix = (pageId: string): Key => `${filesPrefix(pageId)}i/`;

const infoKey = ({ pageId, id }: FileOf): Key => `${infosPrefix(pageId)}${id}`;

const bytesKey = ({ pageId, id }: FileOf): Key => `${filesPrefix(pageId)}b/${id}`;

/** Where a file is: its `FileInfo`, then its bytes. */
export const fileKeys = (file: FileOf): [info: Key, bytes: Key] => [infoKey(file), bytesKey(file)];
