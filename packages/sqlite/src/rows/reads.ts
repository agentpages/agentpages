import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import type { Key, Reader, Value } from "@agentpages/storage";

const GET = "SELECT value FROM rows WHERE key=?";

const GET_MANY = "SELECT r.value FROM json_each(?) j LEFT JOIN rows r ON r.key=j.value ORDER BY j.key";

const SCAN_UP =
  "SELECT key,value FROM rows WHERE key>=:prefix AND key<:prefix||char(65535) AND (:after IS NULL OR key>:after) ORDER BY key LIMIT :limit";

const SCAN_DOWN =
  "SELECT key,value FROM rows WHERE key>=:prefix AND key<:prefix||char(65535) AND (:after IS NULL OR key<:after) ORDER BY key DESC LIMIT :limit";

const isObject = (parsed: unknown): parsed is Record<string, unknown> =>
  typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);

const objectOf = (text: string): Value => {
  const parsed: unknown = JSON.parse(text);
  if (isObject(parsed)) return parsed;
  throw new Error("A row holds a value that is not a JSON object or bytes.");
};

const valueOf = (stored: SQLOutputValue | undefined): Value => (stored instanceof Uint8Array ? stored : objectOf(String(stored)));

/** A promise of what `read` returns, which rejects when it throws. */
const reading = <T>(read: () => T): Promise<T> =>
  new Promise((resolve) => {
    resolve(read());
  });

/** Reads of the committed rows, each one statement. */
export const readerOf = (db: DatabaseSync): Reader => {
  const get = db.prepare(GET);
  const getMany = db.prepare(GET_MANY);
  const scans = { up: db.prepare(SCAN_UP), down: db.prepare(SCAN_DOWN) };
  return {
    get: (key) =>
      reading(() => {
        const row = get.get(key);
        return row === undefined ? undefined : valueOf(row.value);
      }),
    getMany: (keys) =>
      reading(() => getMany.all(JSON.stringify(keys)).map((row) => (row.value === null ? undefined : valueOf(row.value)))),
    scan: ({ prefix, after = null, limit, reverse }) =>
      reading(() =>
        scans[reverse === true ? "down" : "up"]
          .all({ prefix, after, limit })
          .map((row): [Key, Value] => [String(row.key), valueOf(row.value)]),
      ),
  };
};
