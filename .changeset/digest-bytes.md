---
"@agentpages/server": patch
---

Request fingerprints and viewer ids are digested as bytes, so a request with large params costs its size once.
