import { type Answer, TOOL_SCHEMAS } from "@agentpages/protocol";
import type { Storage } from "@agentpages/storage";
import { resultOf } from "./store.ts";

/** Whether a key is of a note of when the Store wrote a row. Such notes stay until a sweep. */
const isNote = (key: string): boolean => key.startsWith("kept/");

/** The keys that are of rows, and not of notes. */
export const rowKeys = (keys: string[]): string[] => keys.filter((key) => !isNote(key));

/** What the Store has saved beside its notes. */
export const savedRows = async (storage: Storage): Promise<unknown> =>
  (await storage.scan({ prefix: "", limit: Number.MAX_SAFE_INTEGER })).filter(([key]) => !isNote(key));

/** The `seq` of the commit a `state_commit` answered with. */
export const seqOf = async (answer: Promise<Answer>): Promise<number> => resultOf(TOOL_SCHEMAS.state_commit.result, await answer).commit.seq;
