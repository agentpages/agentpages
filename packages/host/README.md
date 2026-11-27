# @agentpages/host

The host's half of the page bridge of the [agentpages protocol](../../spec/agentpages.md): it serves one view, a page in a sandboxed iframe, for one viewer. It needs no framework and depends only on `@agentpages/protocol`.

```ts
import { mount } from "@agentpages/host";

const mounted = mount({ frame, url, version, capability, link, on });

await mounted.close();
```

`url` is the link the viewer presented, `version` the version the frame shows, and `capability` the one the Store advertises. `link` is the way to the Store for this viewer: `host` runs a host operation and `view` a method the view called. Neither rejects: a transport failure is an `Unavailable` answer.

## What it does

- It answers `ui/initialize` with the capability, without `render`, and a `ping` with `{}`.
- It passes every other request of the view to `link.view`, once, with the `url` and a `requestId` it chose. The Store decides which methods exist. The view never gets the `url`.
- It asks `link.host` for `pages_heads` at once, and again `intervalMs` after each answer, so two never overlap. Answers that say nothing of the page are skipped.
- When the Store advertises `liveChanges`, it fetches the commits after the last `seq` it sent an initialized view and sends each as `agentpages/state/committed`, page after page until it has sent the `seq` of the heads. A failed fetch is asked again from the same `seq` at the next heads. `ResyncRequired` skips to the `seq` of the heads: the view resyncs itself.
- It pings an initialized view, and again `requestTimeoutMs` after each answer.
- Before `ui/notifications/initialized` it sends nothing of its own.

## Events

`on` is called with what the shell around the view must act on.

| Event | When | What the shell does |
|---|---|---|
| `version` | The page has another current version | Mounts that version |
| `closed` | `pages_heads` answered `NotFound` or `Forbidden` | Closes the view |
| `comments` | The count of comments changed | Lists the threads again |
| `unresponsive` | A ping got no answer in `requestTimeoutMs` | Offers a reload |

After `version` or `closed` the host asks for no more heads. After `unresponsive` it pings no more and keeps the rest going.

`close` stops all of it, sends `ui/resource-teardown` to a view that is initialized and responsive, waits for the answer at most `requestTimeoutMs`, and stops listening.

## Ports

`serve(serving, ports)` is the same without a DOM: `ports` are a `Port` to the view, `Timers` and a source of ids. `mount` is `serve` with the ports of a browser. It hears only messages whose source is `frame.contentWindow` and whose origin is that of `frame.src`, and posts to that origin only.

## Where things are

| Folder | What it holds |
|---|---|
| `serve` | `serve`, and the answers to a view's requests |
| `heads` | The poll of `pages_heads`, and what its answers mean |
| `liveness` | The pings |
| `dom` | `mount` |
