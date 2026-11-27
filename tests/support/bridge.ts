import { MessageChannel, type MessagePort } from "node:worker_threads";
import { type Cancel, type JsonRpcMessage, JsonRpcMessageSchema, type Port, type Timers, validate } from "@agentpages/protocol";
import { onTestFinished } from "vitest";

const portOver = (end: MessagePort): Port => ({
  post: (message) => {
    end.postMessage(message, []);
  },
  listen: (receive) => {
    end.on("message", receive);
    return () => {
      end.off("message", receive);
    };
  },
});

const channel = (): MessageChannel => {
  const made = new MessageChannel();
  onTestFinished(() => {
    made.port1.close();
    made.port2.close();
  });
  return made;
};

/** The two ends of a channel, as a view and its host hold them. It closes when the test ends. */
export const portPair = (): [Port, Port] => {
  const { port1, port2 } = channel();
  return [portOver(port1), portOver(port2)];
};

/** The other end of a port, driven by a test: it sends whatever the test says and keeps what arrives. */
export interface Scripted {
  /** Sends anything, a message of the protocol or not, and resolves once the port has received it. */
  send(data: unknown): Promise<void>;
  /** The next message the port posted that no earlier call returned. It throws when that is not JSON-RPC. */
  next(): Promise<JsonRpcMessage>;
}

const messageOf = (data: unknown): JsonRpcMessage => {
  const message = validate(JsonRpcMessageSchema, data);
  if (!message.ok) throw new TypeError(`Not a JSON-RPC message: ${JSON.stringify(data)}`);
  return message.value;
};

/** A queue of what arrived at one end, handed out in order to whoever asks, before or after it arrives. */
const inbox = (end: MessagePort): (() => Promise<unknown>) => {
  const arrived: unknown[] = [];
  const waiting: ((data: unknown) => void)[] = [];
  end.on("message", (data: unknown) => {
    const take = waiting.shift();
    if (take === undefined) arrived.push(data);
    else take(data);
  });
  return () =>
    new Promise((resolve) => {
      if (arrived.length > 0) resolve(arrived.shift());
      else waiting.push(resolve);
    });
};

/** A port for the code under test and the scripted peer at its other end. */
export const scriptedPort = (): { port: Port; peer: Scripted } => {
  const { port1, port2 } = channel();
  const received = inbox(port1);
  const sent = inbox(port2);
  return {
    port: portOver(port1),
    peer: {
      send: async (data) => {
        port2.postMessage(data, []);
        await received();
      },
      next: async () => messageOf(await sent()),
    },
  };
};

interface Timer {
  at: number;
  run: () => void;
}

/** Timers that run only when a test moves the time. */
export interface ManualTimers extends Timers {
  /** Moves the time on by `ms` and runs every timer that is due, in the order of their times. */
  advance(ms: number): void;
  /** How many timers neither ran nor were cancelled. */
  waiting(): number;
  /** How many times a timer was cancelled that had run or been cancelled before: each is a request kept too long. */
  staleCancels(): number;
}

export const manualTimers = (): ManualTimers => {
  const timers = new Set<Timer>();
  const state = { now: 0, staleCancels: 0 };
  const cancelOf = (timer: Timer): Cancel => () => {
    if (!timers.delete(timer)) state.staleCancels += 1;
  };
  const runDue = (): void => {
    const [first, ...rest] = [...timers].filter((timer) => timer.at <= state.now);
    if (first === undefined) return;
    const next = rest.reduce((soonest, timer) => (timer.at < soonest.at ? timer : soonest), first);
    timers.delete(next);
    next.run();
    runDue();
  };
  return {
    after: (ms, run) => {
      const timer = { at: state.now + ms, run };
      timers.add(timer);
      return cancelOf(timer);
    },
    advance: (ms) => {
      state.now += ms;
      runDue();
    },
    waiting: () => timers.size,
    staleCancels: () => state.staleCancels,
  };
};

/** An id source that counts from 1: `1`, `2`, and with a prefix `host-1`, `host-2`. */
export function counter(): () => number;
export function counter(prefix: string): () => string;
export function counter(prefix?: string): () => string | number {
  let count = 0;
  return () => {
    count += 1;
    return prefix === undefined ? count : `${prefix}${String(count)}`;
  };
}
