---
"@agentpages/server": minor
"@agentpages/conformance": minor
"@agentpages/storage": patch
---

Add files to the Store: `files_put`, `files_get`, `files_list` and `files_delete` as tools and as view methods, when the capability has `files`. A file is stored as its `FileInfo` and its bytes, under its page. `storeSuite` gets the files cases, or the case that says files are not there, and `storageSuite` a case for bytes of 4 MiB. The `Value` of a storage documents that bytes may be as large as the largest file.
