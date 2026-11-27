import { across, type Durable, durableSuite } from "@agentpages/conformance";
import type { Tx } from "@agentpages/storage";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterAll, expect, test } from "vitest";
import { besides, holderOf, LEASE_MS, NEVER_MS, openAlone, sqliteFiles } from "./support/sqlite.ts";
import { wholeStorageSuite } from "./support/storage.ts";
import { whole } from "./support/suites.ts";

const files = sqliteFiles();

afterAll(files.remove);

wholeStorageSuite("the SQLite storage over one connection, whose waiting runs go on only when a run before them ends", () =>
  files.open({ path: files.path(), retryMs: NEVER_MS }),
);

wholeStorageSuite("the SQLite storage over two connections to one file", () => {
  const path = files.path();
  return across([files.open({ path }), files.open({ path })]);
});

/** A storage whose clock a test moves by the time of a lease. */
const leased = (): Durable => {
  const path = files.path();
  const time = { now: 0 };
  return {
    open: () => files.open({ path, clock: { now: () => time.now } }),
    expire: () => {
      time.now += LEASE_MS;
    },
  };
};

whole({
  of: "the SQLite storage as several processes open it",
  register: () => {
    durableSuite(leased);
  },
  titles: [
    "[REL-6] what a transaction saved is read through a later opening",
    "[REL-2] a run that lost its lock to another run rejects and saves nothing, and its storage goes on",
    "[REL-2] a run that lost its lock rejects while the run that took it still runs, and that run saves",
  ],
});

/** A run that puts an empty object under each key. */
const putting =
  (...keys: string[]) =>
  (tx: Tx): Promise<void> => {
    keys.forEach((key) => {
      tx.put(key, {});
    });
    return Promise.resolve();
  };

const keysOf = async (storage: { scan: Tx["scan"] }, prefix = ""): Promise<string[]> =>
  (await storage.scan({ prefix, limit: 100 })).map(([key]) => key);

/** Takes the write lock of the file, says so, and gives it back a while later. */
const WRITER = `
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(process.argv[1]);
db.exec("BEGIN IMMEDIATE");
console.log("writing");
setTimeout(() => db.exec("COMMIT"), 300);
`;

test("[REL-2] a run waits while another process writes to the file", async () => {
  const path = files.path();
  const storage = files.open({ path });
  const writer = spawn(process.execPath, ["--no-warnings", "-e", WRITER, path], { stdio: ["ignore", "pipe", "inherit"] });
  await once(writer.stdout, "data");
  await storage.transact(["lock"], putting("a"));

  expect(await keysOf(storage)).toStrictEqual(["a"]);
  expect(await once(writer, "exit")).toStrictEqual([0, null]);
});

test("[REL-2] a run waits for the run of another process that holds its lock", async () => {
  const path = files.path();
  const storage = files.open({ path });
  const holder = holderOf(path);
  await once(holder.stdout, "data");
  const seen = storage.transact(["lock"], (tx) => tx.get("held"));
  holder.stdin.end();

  expect(await seen).toStrictEqual({});
  expect(await once(holder, "exit")).toStrictEqual([0, null]);
});

test("[REL-2] a clock that tells fractions of a millisecond is taken", async () => {
  const storage = files.open({ path: files.path(), clock: { now: () => 0.5 } });

  expect(await storage.transact(["lock"], () => storage.get("a"))).toBeUndefined();
});

test("[REL-8] a run that throws after its storage closed rejects with both errors", async () => {
  const storage = openAlone({ path: files.path() });
  const thrown = new Error("thrown by the run");
  const rejection: unknown = await storage
    .transact(["lock"], () => {
      storage.close();
      return Promise.reject(thrown);
    })
    .catch((error: unknown) => error);

  expect(rejection).toBeInstanceOf(AggregateError);
  expect(rejection).toMatchObject({
    message: "The run failed and its ticket stays until its lease ends.",
    errors: [thrown, { message: "database is not open" }],
  });
});

test("[REL-8] a run that does not get to write within its lease rejects and saves nothing, and the next run goes on", async () => {
  const path = files.path();
  const storage = files.open({ path, leaseMs: 20 });
  const writer = new DatabaseSync(path);
  writer.exec("BEGIN IMMEDIATE");
  const waited = storage.transact(["lock"], putting("a"));

  await expect(waited).rejects.toThrow("database is locked");

  writer.close();
  await storage.transact(["lock"], putting("b"));

  expect(await keysOf(storage)).toStrictEqual(["b"]);
});

test("[REL-2] a run whose lease ran out while it waited rejects and never runs, and so does the run it waited for", async () => {
  const { open, expire } = leased();
  const storage = open();
  const started: string[] = [];
  const starting = (name: string) => async (tx: Tx) => {
    started.push(name);
    await putting(name)(tx);
    await storage.transact(["another lock"], putting("another"));
  };
  const first = storage.transact(["lock"], starting("first"));
  const second = storage.transact(["lock"], starting("second"));
  expire();

  await expect(second).rejects.toThrow("The lease of the run expired.");
  await expect(first).rejects.toThrow("The lease of the run expired.");
  expect(started).toStrictEqual(["first"]);
  expect(await keysOf(storage)).toStrictEqual(["another"]);
});

test("[COMMON-4] a prefix is taken letter by letter: %, _ and / stand for themselves in a scan and in deleteRange", async () => {
  const storage = files.open({ path: files.path() });
  const keys = ["%", "_", "a%/1", "a//1", "a_/1", "ab/1"];
  await storage.transact([], putting(...keys));
  const scans = [await keysOf(storage, "a%"), await keysOf(storage, "a_"), await keysOf(storage, "a/"), await keysOf(storage, "%"), await keysOf(storage, "_")];
  await storage.transact([], (tx) => {
    tx.deleteRange("a_");
    tx.deleteRange("%");
    return Promise.resolve();
  });

  expect(scans).toStrictEqual([["a%/1"], ["a_/1"], ["a//1"], ["%"], ["_"]]);
  expect(await keysOf(storage)).toStrictEqual(["_", "a%/1", "a//1", "ab/1"]);
});

test("a file that is not a SQLite database is not opened", () => {
  const path = files.path();
  writeFileSync(path, "not a database".repeat(100));

  expect(() => files.open({ path })).toThrow("file is not a database");
});

/** What a database file holds, read through a connection of its own. */
const holdingOf = (path: string): unknown[] => {
  const db = new DatabaseSync(path);
  const held = ["SELECT name FROM sqlite_schema", "PRAGMA application_id", "PRAGMA user_version", "PRAGMA journal_mode"].map((sql) => db.prepare(sql).all());
  db.close();
  return held.flat().flatMap((row) => Object.values(row));
};

/** A closed database file that `sql` made. */
const madeBy = (sql: string): string => {
  const path = files.path();
  const db = new DatabaseSync(path);
  db.exec(sql);
  db.close();
  return path;
};

test("a file that holds another version of the storage is not opened, and stays as it is", () => {
  const path = madeBy("PRAGMA user_version=7");

  expect(() => files.open({ path })).toThrow(`${path} is not a storage of this version.`);
  expect(holdingOf(path)).toStrictEqual([0, 7, "delete"]);
});

test("a database of another program is not opened, and stays as it is", () => {
  const path = madeBy("PRAGMA journal_mode=WAL; CREATE TABLE theirs(a)");

  expect(() => files.open({ path })).toThrow(`${path} is not a storage of this version.`);
  expect(besides(path)).toStrictEqual([]);
  expect(holdingOf(path)).toStrictEqual(["theirs", 0, 0, "wal"]);
});

test("a storage opens while another connection writes to the file", async () => {
  const path = files.path();
  await files.open({ path }).transact([], putting("a"));
  const writer = new DatabaseSync(path);
  writer.exec("BEGIN IMMEDIATE");
  const storage = files.open({ path, leaseMs: 20 });
  writer.close();

  expect(await keysOf(storage)).toStrictEqual(["a"]);
});

test("a row that another program wrote as 1, null or [1] is not read", async () => {
  const path = files.path();
  const storage = files.open({ path });
  const other = new DatabaseSync(path);
  other.exec("INSERT INTO rows(key,value) VALUES('a',1),('b','null'),('c','[1]'),('d','{}')");
  other.close();
  const refused = "A row holds a value that is not a JSON object or bytes.";

  await expect(storage.get("a")).rejects.toThrow(refused);
  await expect(storage.get("b")).rejects.toThrow(refused);
  await expect(storage.get("c")).rejects.toThrow(refused);
  expect(await storage.get("d")).toStrictEqual({});
});

test("a closed SQLite storage rejects every call", async () => {
  const closed = sqliteFiles();
  const storage = closed.open({ path: closed.path() });
  closed.remove();

  await expect(storage.get("a")).rejects.toThrow("statement has been finalized");
  await expect(storage.transact([], putting("a"))).rejects.toThrow("database is not open");
});
