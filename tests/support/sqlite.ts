import { openSqliteStorage, type SqliteOptions, type SqliteStorage } from "@agentpages/sqlite";
import { type ChildProcessByStdio, spawn } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";

/** Long enough that no run of a test loses its locks unless the test moves the clock. */
export const LEASE_MS = 60_000;

/** So long that a run which waits goes on only when a run of its own connection wakes it. */
export const NEVER_MS = 3_600_000;

/** Opens a storage whose clock stands still, unless the options say otherwise. The caller closes it. */
export const openAlone = (options: Partial<SqliteOptions> & Pick<SqliteOptions, "path">): SqliteStorage =>
  openSqliteStorage({ clock: { now: () => 0 }, leaseMs: LEASE_MS, retryMs: 1, ...options });

/** The names of the files SQLite keeps beside a database while a connection to it is open. */
export const besides = (path: string): string[] =>
  readdirSync(dirname(path)).filter((name) => name.startsWith(`${basename(path)}-`));

const SOURCES = new URL("./sources.ts", import.meta.url).href;

const HOLDER = fileURLToPath(new URL("./holder.ts", import.meta.url));

/** Another process that holds the lock `lock` of the storage in the file until its input ends, then puts `held`. */
export const holderOf = (path: string): ChildProcessByStdio<Writable, Readable, null> =>
  spawn(process.execPath, ["--no-warnings", "--experimental-strip-types", "--import", SOURCES, HOLDER, path], {
    stdio: ["pipe", "pipe", "inherit"],
  });

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
      const storage = openAlone(options);
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
