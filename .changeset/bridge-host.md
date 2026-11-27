---
"@agentpages/host": minor
---

Add the host's half of the page bridge. `serve` serves one view of a page for one viewer over a `Port`: it answers `ui/initialize` and `ping`, passes every other request of the view to the Store once through a `Link`, under a `requestId` it chose, and never gives the view the viewer's link. It asks `pages_heads` in a chain, sends an initialized view the commits it has not sent yet, and reports a new version, a deleted or forbidden page, new comments and a view that stopped answering pings as `HostEvent`s. `close` tears the view down. `mount` is `serve` over an iframe, and hears only that frame at the origin of its `src`.
