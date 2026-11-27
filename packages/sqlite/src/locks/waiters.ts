export interface Waiters {
  /** Resolves at the next `wake`, or after the time between two looks. */
  pause(): Promise<void>;
  /** Lets every run that pauses go on. */
  wake(): void;
}

/** The runs of this connection that wait for a lock. A run that ends wakes them, so they need not wait for a timer. */
export const waitersOf = (retryMs: number): Waiters => {
  const waiting = new Set<() => void>();
  return {
    pause: () =>
      new Promise((resolve) => {
        const timer = setTimeout(resolve, retryMs);
        waiting.add(() => {
          clearTimeout(timer);
          resolve();
        });
      }),
    wake: () => {
      waiting.forEach((go) => {
        go();
      });
      waiting.clear();
    },
  };
};
