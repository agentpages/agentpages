import type { DatabaseSync, StatementResultingChanges } from "node:sqlite";
import type { Clock, Key } from "@agentpages/storage";
import { atomically } from "../database/connect.js";

/** The place of a run in the queue. */
export type Ticket = StatementResultingChanges["lastInsertRowid"];

export interface Lease {
  clock: Clock;
  /** How long a ticket lasts after its run last took a step, in milliseconds. */
  leaseMs: number;
}

/** The runs of every connection to the database, in the order they came. Each step is one write transaction. */
export interface Queue {
  /** Takes a ticket behind every run that waits for one of the locks or holds it. */
  enter(locks: readonly Key[]): Ticket;
  /** Whether a run ahead holds one of the locks of the ticket. Renews the ticket, and throws when it expired. */
  blocked(ticket: Ticket): boolean;
  /** Gives the ticket back and does `save`, together. Throws when the ticket expired, and then saves nothing. */
  leave(ticket: Ticket, save: () => void): void;
  /** Gives the ticket back. */
  abandon(ticket: Ticket): void;
}

const AHEAD =
  "SELECT 1 FROM waits mine JOIN waits ahead ON ahead.lock=mine.lock AND ahead.ticket<mine.ticket WHERE mine.ticket=? LIMIT 1";

const held = ({ changes }: StatementResultingChanges): void => {
  if (changes === 0) throw new Error("The lease of the run expired.");
};

export const queueOf = (db: DatabaseSync, { clock, leaseMs }: Lease): Queue => {
  const reap = db.prepare("DELETE FROM runs WHERE expires<=?");
  const join = db.prepare("INSERT INTO runs(expires) VALUES(?)");
  const wait = db.prepare("INSERT OR IGNORE INTO waits(lock,ticket) SELECT value,?2 FROM json_each(?1)");
  const renew = db.prepare("UPDATE runs SET expires=? WHERE ticket=?");
  const ahead = db.prepare(AHEAD);
  const leave = db.prepare("DELETE FROM runs WHERE ticket=?");
  const expiry = (): number => clock.now() + leaseMs;
  return {
    enter: (locks) =>
      atomically(db, () => {
        reap.run(clock.now());
        const ticket = join.run(expiry()).lastInsertRowid;
        wait.run(JSON.stringify(locks), ticket);
        return ticket;
      }),
    blocked: (ticket) =>
      atomically(db, () => {
        held(renew.run(expiry(), ticket));
        reap.run(clock.now());
        return ahead.get(ticket) !== undefined;
      }),
    leave: (ticket, save) => {
      atomically(db, () => {
        held(leave.run(ticket));
        save();
      });
    },
    abandon: (ticket) => {
      leave.run(ticket);
    },
  };
};
