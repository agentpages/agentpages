import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA fullfsync=ON; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS rows(key TEXT PRIMARY KEY, value ANY NOT NULL) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS runs(ticket INTEGER PRIMARY KEY AUTOINCREMENT, expires INTEGER NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS waits(lock TEXT NOT NULL, ticket INTEGER NOT NULL REFERENCES runs ON DELETE CASCADE, PRIMARY KEY(lock,ticket)) STRICT, WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS waits_ticket ON waits(ticket);
PRAGMA user_version=1;`;

const OTHER_VERSION = "SELECT 1 FROM pragma_user_version WHERE user_version NOT IN (0,1)";

export interface Connection {
  /** The file of the database. It is created when it does not exist. */
  path: string;
  /** How long a step waits for the write lock of the database, in milliseconds. */
  timeout: number;
}

/** Opens the database with its tables. Throws when the file is not a storage of this version. */
export const connect = ({ path, timeout }: Connection): DatabaseSync => {
  const db = new DatabaseSync(path, { timeout });
  if (db.prepare(OTHER_VERSION).get() !== undefined) throw new Error(`${path} holds another version of the storage.`);
  db.exec(SCHEMA);
  return db;
};

/** Does `work` in one write transaction: all of it is saved, or none when it throws. */
export const atomically = <T>(db: DatabaseSync, work: () => T): T => {
  try {
    db.exec("BEGIN IMMEDIATE");
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
};
