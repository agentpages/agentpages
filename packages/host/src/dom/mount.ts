import type { Port, Timers } from "@agentpages/protocol";
import { serve } from "../serve/serve.js";
import type { Mounted, Serving } from "../types.js";

/** As much of an `HTMLIFrameElement` as `mount` uses. */
export interface Frame {
  /** The address of the page. Its origin is the only one heard and the only one posted to. */
  readonly src: string;
  readonly contentWindow: { postMessage(message: unknown, targetOrigin: string): void } | null;
}

const framePort = (frame: Frame): Port => {
  const { origin } = new URL(frame.src);
  return {
    post: (message) => {
      frame.contentWindow?.postMessage(message, origin);
    },
    listen: (receive) => {
      const hear = (event: MessageEvent<unknown>): void => {
        if (event.source === frame.contentWindow && event.origin === origin) receive(event.data);
      };
      window.addEventListener("message", hear);
      return () => {
        window.removeEventListener("message", hear);
      };
    },
  };
};

const timers: Timers = {
  after: (ms, run) => {
    const timer = setTimeout(run, ms);
    return () => {
      clearTimeout(timer);
    };
  },
};

/**
 * `serve` over an iframe in this window: accepts only messages whose source is `frame.contentWindow` and whose origin
 * is that of `frame.src`, and posts to that origin only (SEC-2).
 */
export const mount = ({ frame, ...serving }: Serving & { frame: Frame }): Mounted =>
  serve(serving, { port: framePort(frame), timers, id: () => crypto.randomUUID() });
