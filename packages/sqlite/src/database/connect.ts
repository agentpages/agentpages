import { DatabaseSync } from "node:sqlite";

const APPLICATION = 1095780179;

const KIND = `SELECT CASE WHEN application_id=${APPLICATION} AND user_version=1 THEN 'ours'
 WHEN application_id=0 AND user_version=0 AND NOT EXISTS(SELECT 1 FROM sqlite_schema) THEN 'new'
 ELSE 'other' END AS kind FROM pragma_application_id, pragma_user_version`;

const CREATE = `
CREATE TABLE IF NOT EXISTS rows(key TEXT PRIMARY KEY, value ANY NOT NULL) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS runs(ticket INTEGER PRIMARY KEY AUTOINCREMENT, expires REAL NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS waits(lock TEXT NOT NULL, ticket INTEGER NOT NULL REFERENCES runs ON DELETE CASCADE, PRIMARY KEY(lock,ticket)) STRICT, WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS waits_ticket ON waits(ticket);
PRAGMA application_id=${APPLICATION}; PRAGMA user_version=1;`;

const SETTINGS = "PRAGMA journal_mode=WAL";

export interface Connection {
  /** The file of the database. It is created when it does not exist. */
  path: string;
  /** How long a step waits for the write lock of the database, in milliseconds. */
  timeout: number;
}

/** Does `work` in one write transaction: all of it is saved, or none when it throws. */
type Transaction = <T>(db: DatabaseSync, work: () => T) => T;

const transaction =
  (begin: string): Transaction =>
  (db, work) => {
    try {
      db.exec(begin);
      const result = work();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      if (db.isTransaction) db.exec("ROLLBACK");
      throw error;
    }
  };

/** Synced to disk before it returns. */
export const durably: Transaction = transaction("PRAGMA synchronous=FULL; BEGIN IMMEDIATE");

/** A power loss may undo it. */
export const atomically: Transaction = transaction("PRAGMA synchronous=NORMAL; BEGIN IMMEDIATE");

const kindOf = (db: DatabaseSync): string =>
  db
    .prepare(KIND)
    .all()
    .map(({ kind }) => kind)
    .join("");

const prepare = (db: DatabaseSync, path: string): void => {
  if (kindOf(db) === "new")
    atomically(db, () => {
      db.exec(CREATE);
    });
  if (kindOf(db) !== "ours") throw new Error(`${path} is not a storage of this version.`);
  db.exec(SETTINGS);
};

/** Opens the database with its tables. Throws when the file is not a storage of this version, and then closes it. */
export const connect = ({ path, timeout }: Connection): DatabaseSync => {
  const db = new DatabaseSync(path, { timeout });
  try {
    prepare(db, path);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
};
