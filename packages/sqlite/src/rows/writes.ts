import type { DatabaseSync, StatementSync, SQLInputValue } from "node:sqlite";
import type { Reader, Tx, Value } from "@agentpages/storage";

/** A statement and what it runs with. */
export type Write = [StatementSync, ...SQLInputValue[]];

const stored = (value: Value): SQLInputValue => (value instanceof Uint8Array ? value.slice() : JSON.stringify(value));

export const save = (writes: readonly Write[]): void => {
  writes.forEach(([statement, ...values]) => {
    statement.run(...values);
  });
};

/** Makes the transaction of each run, which reads the committed rows and adds its writes to the `writes` it is given. */
export const txFor = (db: DatabaseSync, reader: Reader): ((writes: Write[]) => Tx) => {
  const put = db.prepare("INSERT INTO rows(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  const remove = db.prepare("DELETE FROM rows WHERE key=?");
  const removeUnder = db.prepare("DELETE FROM rows WHERE key>=?1 AND key<?1||char(65535)");
  return (writes) => ({
    ...reader,
    put: (key, value) => {
      writes.push([put, key, stored(value)]);
    },
    delete: (key) => {
      writes.push([remove, key]);
    },
    deleteRange: (prefix) => {
      writes.push([removeUnder, prefix]);
    },
  });
};
