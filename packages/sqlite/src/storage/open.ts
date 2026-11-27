import type { Clock, Storage, Tx } from "@agentpages/storage";
import { connect } from "../database/connect.js";
import { queueOf, type Ticket } from "../locks/queue.js";
import { waitersOf } from "../locks/waiters.js";
import { readerOf } from "../rows/reads.js";
import { save, txFor, type Write } from "../rows/writes.js";

export interface SqliteOptions {
  /** The file of the database. It is created when it does not exist. */
  path: string;
  clock: Clock;
  /**
   * How long a run keeps its locks after its last step, in milliseconds. A run that takes longer rejects and saves
   * nothing once another run took its place. It is also how long a step waits for the write lock of the database.
   */
  leaseMs: number;
  /** How long a run waits before it looks again for a lock that a run of another connection holds, in milliseconds. */
  retryMs: number;
}

export interface SqliteStorage extends Storage {
  /** Closes the file. Every later call rejects. */
  close(): void;
}

interface Run<T> {
  ticket: Ticket;
  run: (tx: Tx) => Promise<T>;
}

/**
 * A Storage in one SQLite file, for every process on one machine that opens the file. It throws when the file is not
 * a storage of this version.
 */
export const openSqliteStorage = (options: SqliteOptions): SqliteStorage => {
  const db = connect({ path: options.path, timeout: options.leaseMs });
  const reader = readerOf(db);
  const txOf = txFor(db, reader);
  const queue = queueOf(db, options);
  const waiters = waitersOf(options.retryMs);
  const turnOf = async (ticket: Ticket): Promise<void> => {
    if (!queue.blocked(ticket)) return;
    await waiters.pause();
    await turnOf(ticket);
  };
  const commit = async <T>({ ticket, run }: Run<T>): Promise<T> => {
    const writes: Write[] = [];
    try {
      const result = await run(txOf(writes));
      queue.leave(ticket, () => {
        save(writes);
      });
      return result;
    } catch (error) {
      queue.abandon(ticket);
      throw error;
    } finally {
      waiters.wake();
    }
  };
  return {
    ...reader,
    transact: async (locks, run) => {
      const ticket = queue.enter(locks);
      await turnOf(ticket);
      return commit({ ticket, run });
    },
    close: () => {
      db.close();
    },
  };
};
