---
"@agentpages/protocol": minor
"@agentpages/server": minor
"@agentpages/conformance": minor
"@agentpages/storage": patch
---

Add files to the Store: `files_put`, `files_get`, `files_list` and `files_delete` as tools and as view methods, when the capability has `files`. A file is stored as its `FileInfo` and its bytes, under its page. `storeSuite` gets the files cases, or the case that says files are not there, and `storageSuite` a case for bytes of 4 MiB. The `Value` of a storage documents that bytes may be as large as the largest file.

`@agentpages/protocol` exports `isBase64`, which checks canonical base64 in linear time, in place of `BASE64_PATTERN`, which overflowed the stack on a blob of a few MiB. The `inputSchema` of `files_put` says that `blob` is a string with `contentEncoding: "base64"`. A request whose params throw while the Store reads them is answered `Internal` and logged.
