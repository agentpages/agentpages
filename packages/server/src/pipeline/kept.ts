import type { Key, Storage, Tx, Value } from "@agentpages/storage";
import { counted } from "./keys.js";
import type { Deps } from "./operation.js";
import { corrupt, recordOf } from "./records.js";
import { inTurn } from "./turns.js";

export const MS_PER_SECOND = 1000;

/** What a Store deletes once it is past its retention: the requests it remembers, and the commits of its logs. */
type Kind = "op" | "commit";

const KINDS: Kind[] = ["op", "commit"];

const keptPrefix = (kind: Kind): Key => `kept/${kind}/`;

/** What the key of every row of a kind that was written at `ms` starts with. Such keys sort in the order of time. */
const writtenAt = (kind: Kind, ms: number): Key => `${keptPrefix(kind)}${counted(ms)}`;

export interface Keeping {
  kind: Kind;
  /** When the row was written, as a timestamp. */
  at: string;
  row: Key;
  /** The lock under which the row is written and deleted. */
  lock: Key;
}

/** Notes, in the transaction that writes a row, when it was written: a sweep finds it there once its retention is over. */
export const keep = (tx: Tx, { kind, at, row, lock }: Keeping): void => {
  tx.put(`${writtenAt(kind, Date.parse(at))}/${row}`, { lock });
};

interface Expired {
  /** The key of the note of the row. */
  note: Key;
  row: Key;
  /** When the note says the row was written, as a timestamp. */
  at: string;
  lock: Key;
}

const lockOf = (value: Value): Key => {
  const { lock } = recordOf(value);
  return typeof lock === "string" ? lock : corrupt();
};

/** A note as the sweep reads it. */
const notedBy =
  (kind: Kind) =>
  ([note, value]: [Key, Value]): Expired => {
    const written = writtenAt(kind, 0).length;
    const at = new Date(Number(note.slice(keptPrefix(kind).length, written))).toISOString();
    return { note, row: note.slice(written + 1), at, lock: lockOf(value) };
  };

type Sweeping = Pick<Deps, "storage" | "clock" | "capability">;

interface Sweep {
  deps: Sweeping;
  limit: number;
  now: number;
}

/**
 * The rows of a kind that are past their retention, among its `limit` oldest. A request that was on its way when the
 * retention of a row ended may still count on the row, so a row stays for `requestTimeoutMs` more.
 */
const expired =
  ({ deps, limit, now }: Sweep) =>
  async (kind: Kind): Promise<Expired[]> => {
    const { opRetentionSeconds, commitRetentionSeconds, requestTimeoutMs } = deps.capability.limits;
    const seconds = { op: opRetentionSeconds, commit: commitRetentionSeconds }[kind];
    const end = new Date(now - seconds * MS_PER_SECOND - requestTimeoutMs).toISOString();
    const notes = await deps.storage.scan({ prefix: keptPrefix(kind), limit });
    return notes.map(notedBy(kind)).filter(({ at }) => at < end);
  };

const byLock = (rows: Expired[]): [Key, Expired[]][] =>
  [...new Set(rows.map(({ lock }) => lock))].map((lock) => [lock, rows.filter((row) => row.lock === lock)]);

/** Whether `value` is the row a note is of: one that was written when the note says, and not a later one at its key. */
const isNoted = (value: Value | undefined, at: string): boolean => value !== undefined && recordOf(value).at === at;

/**
 * Clears notes under their lock, each with its row, and resolves with how many. A note that is gone was cleared since
 * the scan. A row that is not the one its note is of has a note of its own, and stays.
 */
const forget =
  (storage: Storage) =>
  ([lock, rows]: [Key, Expired[]]): Promise<number> =>
    storage.transact([lock], async (tx) => {
      const stored = await tx.getMany([...rows.map(({ note }) => note), ...rows.map(({ row }) => row)]);
      const found = rows.map((one, position) => ({ ...one, value: stored[rows.length + position] }));
      const noted = found.filter((_, position) => stored[position] !== undefined);
      noted.forEach(({ note }) => {
        tx.delete(note);
      });
      noted
        .filter(({ value, at }) => isNoted(value, at))
        .forEach(({ row }) => {
          tx.delete(row);
        });
      return noted.length;
    });

/** Clears up to `limit` notes of each kind that are past their retention, with their rows, and resolves with how many. */
export const sweep = async (deps: Sweeping, limit: number): Promise<number> => {
  const found = await inTurn(KINDS, expired({ deps, limit, now: deps.clock.now() }));
  const cleared = await inTurn(byLock(found.flat()), forget(deps.storage));
  return cleared.reduce((sum, count) => sum + count, 0);
};
