import type { FileInfo } from "@agentpages/protocol";
import type { Tx } from "@agentpages/storage";
import type { Page } from "../pages/records.js";
import type { Context } from "../pipeline/index.js";
import { fileKeys } from "./keys.js";

export interface Saving {
  /** The request that saves the file, on the page that gets it. */
  context: Context<unknown, Page>;
  named: Pick<FileInfo, "id" | "name" | "mimeType">;
  bytes: Uint8Array;
}

/** Section 4.4 of the spec: writes a file of a page in place of any with its `id`, and returns it as `put` does. */
export const saveFile = async (tx: Tx, { context, named, bytes }: Saving): Promise<FileInfo> => {
  const { principal, target, at, deps } = context;
  const { pageId } = target.info;
  const { id, name, mimeType } = named;
  const updatedBy = await deps.actors.actorOf({ principal, pageId });
  const file = { id, name, mimeType, size: bytes.length, updatedAt: at, updatedBy };
  const [info, stored] = fileKeys({ pageId, id });
  tx.put(info, { ...file });
  tx.put(stored, bytes);
  return file;
};
