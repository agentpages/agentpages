import type { HostOperations, PagesTools } from "@agentpages/protocol";
import { type Handler } from "../pipeline/index.js";
import type { Agent, Visitor } from "../access/principal.js";
import { pagesSetAccess } from "./access.js";
import { pagesDelete } from "./delete.js";
import { pagesGet } from "./get.js";
import { pagesList } from "./list.js";
import { pagesOpen } from "./open.js";
import { pagesPublish } from "./publish.js";
import { pagesVersions } from "./versions.js";

export const PAGES_TOOLS: {
  readonly [T in keyof PagesTools]: Handler<PagesTools[T]["params"], PagesTools[T]["result"], Agent>;
} = {
  pages_publish: pagesPublish,
  pages_get: pagesGet,
  pages_list: pagesList,
  pages_versions: pagesVersions,
  pages_set_access: pagesSetAccess,
  pages_delete: pagesDelete,
};

type Open = HostOperations["pages_open"];

export const PAGES_HOST_OPERATIONS: { readonly pages_open: Handler<Open["params"], Open["result"], Visitor> } = {
  pages_open: pagesOpen,
};
