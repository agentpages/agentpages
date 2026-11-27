import { openSqliteStorage, type SqliteOptions, type SqliteStorage } from "@agentpages/sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Long enough that no run of a test loses its locks unless the test moves the clock. */
export const LEASE_MS = 60_000;

/** So long that a run which waits goes on only when a run of its own connection wakes it. */
export const NEVER_MS = 3_600_000;

/** SQLite files in a folder of their own, which a test file removes when it is done. */
export interface Files {
  /** The path of a file that does not exist yet. */
  path: () => string;
  /** Opens a storage whose clock stands still, unless the options say otherwise. */
  open: (options: Partial<SqliteOptions> & Pick<SqliteOptions, "path">) => SqliteStorage;
  /** Closes what `open` opened and removes the folder. */
  remove: () => void;
}

export const sqliteFiles = (): Files => {
  const folder = mkdtempSync(join(tmpdir(), "agentpages-"));
  const opened: SqliteStorage[] = [];
  const made = { paths: 0 };
  return {
    path: () => {
      made.paths += 1;
      return join(folder, `${made.paths}.sqlite`);
    },
    open: (options) => {
      const storage = openSqliteStorage({ clock: { now: () => 0 }, leaseMs: LEASE_MS, retryMs: 1, ...options });
      opened.push(storage);
      return storage;
    },
    remove: () => {
      opened.forEach((storage) => {
        storage.close();
      });
      rmSync(folder, { recursive: true });
    },
  };
};
