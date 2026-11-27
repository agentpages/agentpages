import { type FilesLimits, type FilesMethods, METHOD_SCHEMAS, TOOL_SCHEMAS, type ToolsOf } from "@agentpages/protocol";
import type { Agent } from "../access/principal.js";
import type { Handler, Shown } from "../pipeline/index.js";
import { existingPage, shownPage } from "../pages/target.js";
import { filesDelete } from "./delete.js";
import { filesGet } from "./get.js";
import { filesList } from "./list.js";
import { filesPut } from "./put.js";

type FilesTools = ToolsOf<FilesMethods>;

export type FilesToolHandlers = {
  readonly [T in keyof FilesTools]: Handler<FilesTools[T]["params"], FilesTools[T]["result"], Agent>;
};

export type FilesMethodHandlers = {
  readonly [M in keyof FilesMethods]: Shown<FilesMethods[M]["params"], FilesMethods[M]["result"]>;
};

/** Section 5.3 of the spec: each files method as a tool of an agent, which names its page by `pageId`. */
export const filesTools = (limits: FilesLimits): FilesToolHandlers => ({
  files_put: filesPut(limits)({ schemas: TOOL_SCHEMAS.files_put, page: existingPage }),
  files_get: filesGet({ schemas: TOOL_SCHEMAS.files_get, page: existingPage }),
  files_list: filesList({ schemas: TOOL_SCHEMAS.files_list, page: existingPage }),
  files_delete: filesDelete({ schemas: TOOL_SCHEMAS.files_delete, page: existingPage }),
});

/** Section 4.4 of the spec: each files method of a view, whose page is the one its link names. */
export const filesMethods = (limits: FilesLimits): FilesMethodHandlers => ({
  "agentpages/files/put": (url) => filesPut(limits)({ schemas: METHOD_SCHEMAS["agentpages/files/put"], page: shownPage(url) }),
  "agentpages/files/get": (url) => filesGet({ schemas: METHOD_SCHEMAS["agentpages/files/get"], page: shownPage(url) }),
  "agentpages/files/list": (url) => filesList({ schemas: METHOD_SCHEMAS["agentpages/files/list"], page: shownPage(url) }),
  "agentpages/files/delete": (url) => filesDelete({ schemas: METHOD_SCHEMAS["agentpages/files/delete"], page: shownPage(url) }),
});
