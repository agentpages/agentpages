import type { Cancel, Timers } from "@agentpages/protocol";

/** Steps that follow one another, each after a wait, until stopped. */
export interface Chain {
  /** Runs `step` after `ms`, unless the chain is stopped by then. A stopped chain takes no further step. */
  after(ms: number, step: () => Promise<void>): void;
  stopped(): boolean;
  stop: Cancel;
}

export const createChain = (timers: Timers): Chain => {
  const state = { stopped: false, cancel: (): void => {} };
  return {
    after: (ms, step) => {
      state.cancel = timers.after(ms, () => {
        state.cancel = (): void => {};
        void step();
      });
    },
    stopped: () => state.stopped,
    stop: () => {
      state.stopped = true;
      state.cancel();
    },
  };
};
