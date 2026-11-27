import { type HostEvent, type Mounted, mount, type Serving } from "@agentpages/host";
import { type HostRequest, UUID_PATTERN, type ViewRequest } from "@agentpages/protocol";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CAPABILITY, heads, LINK, request, settle, SHOWN } from "./support/host.ts";

const ORIGIN = "https://page-1.pages.test";

interface Heard {
  source: unknown;
  origin: string;
  data: unknown;
}

type Listener = (event: Heard) => void;

interface Page {
  postMessage: (message: unknown, targetOrigin: string) => void;
}

interface Subject {
  mounted: Mounted;
  /** The window of the page in the frame. */
  page: Page;
  frame: { src: string; contentWindow: Page | null };
  /** Delivers a message to the window of the host, as every listener on it hears it. */
  hear: (event: Heard) => void;
  listeners: Set<Listener>;
  posted: [unknown, string][];
  hosts: HostRequest[];
  views: ViewRequest[];
  events: HostEvent[];
}

const subject = (): Subject => {
  const listeners = new Set<Listener>();
  const posted: Subject["posted"] = [];
  const hosts: HostRequest[] = [];
  const views: ViewRequest[] = [];
  const events: HostEvent[] = [];
  vi.stubGlobal("window", {
    addEventListener: (type: string, listener: Listener) => type === "message" && listeners.add(listener),
    removeEventListener: (type: string, listener: Listener) => type === "message" && listeners.delete(listener),
  });
  const page: Page = {
    postMessage: (message, targetOrigin) => {
      posted.push([message, targetOrigin]);
    },
  };
  const link: Serving["link"] = {
    host: (asked) => {
      hosts.push(asked);
      return Promise.resolve(heads());
    },
    view: (asked) => {
      views.push(asked);
      return Promise.resolve({ kind: "result", result: { viewer: null } });
    },
  };
  const frame: Subject["frame"] = { src: `${ORIGIN}/view?page=1`, contentWindow: page };
  const on = (event: HostEvent): void => {
    events.push(event);
  };
  const mounted = mount({ frame, url: LINK, version: SHOWN, capability: CAPABILITY, link, on });
  const hear: Subject["hear"] = (event) => {
    listeners.forEach((listener) => {
      listener(event);
    });
  };
  return { mounted, page, frame, hear, listeners, posted, hosts, views, events };
};

const IDENTITY = request(1, { method: "agentpages/identity/get" });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("[SEC-2] a mounted host answers its frame, at the origin of the frame only", async () => {
  const { hear, page, posted, views } = subject();
  hear({ source: page, origin: ORIGIN, data: IDENTITY });
  await settle();
  expect(views.map(({ method, url }) => [method, url])).toStrictEqual([["agentpages/identity/get", LINK]]);
  expect(posted).toStrictEqual([[{ jsonrpc: "2.0", id: 1, result: { viewer: null } }, ORIGIN]]);
});

test("[SEC-2] a message from another window or another origin reaches no link and gets no answer", async () => {
  const { hear, page, posted, views } = subject();
  hear({ source: { postMessage: page.postMessage }, origin: ORIGIN, data: IDENTITY });
  hear({ source: page, origin: "https://page-2.pages.test", data: IDENTITY });
  hear({ source: null, origin: "null", data: IDENTITY });
  await settle();
  expect([views, posted]).toStrictEqual([[], []]);
});

test("[REL-25] a mounted host draws a new UUID for every request", async () => {
  const { hear, page, views, hosts } = subject();
  hear({ source: page, origin: ORIGIN, data: IDENTITY });
  hear({ source: page, origin: ORIGIN, data: IDENTITY });
  const ids = [...hosts, ...views].map(({ requestId }) => requestId);
  expect(ids.map((id) => UUID_PATTERN.test(id))).toStrictEqual([true, true, true]);
  expect(new Set(ids).size).toBe(3);
  await settle();
});

test("[HOST-7] a mounted host asks for heads every second by the timers of its window", async () => {
  const { hosts } = subject();
  await settle();
  vi.advanceTimersByTime(999);
  await settle();
  expect(hosts).toHaveLength(1);
  vi.advanceTimersByTime(1);
  expect(hosts).toHaveLength(2);
});

test("[REL-17] a mounted host that is closed leaves no listener and no timer behind", async () => {
  const { mounted, listeners, hosts } = subject();
  await settle();
  expect([listeners.size, vi.getTimerCount()]).toStrictEqual([1, 1]);
  await mounted.close();
  expect([listeners.size, vi.getTimerCount()]).toStrictEqual([0, 0]);
  vi.advanceTimersByTime(5000);
  expect(hosts).toHaveLength(1);
});

test("[SEC-2] a mounted host whose frame lost its window posts nothing", async () => {
  const { hear, page, frame, posted, views } = subject();
  hear({ source: page, origin: ORIGIN, data: IDENTITY });
  frame.contentWindow = null;
  await settle();
  expect(views).toHaveLength(1);
  expect(posted).toStrictEqual([]);
});
