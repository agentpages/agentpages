import type { HostOperations } from "@agentpages/protocol";
import type { Visitor } from "../access/principal.js";
import type { Handler } from "../pipeline/index.js";
import { pagesHeads } from "./heads.js";
import { pagesOpen } from "./open.js";

type Pages = Pick<HostOperations, "pages_open" | "pages_heads">;

export const PAGES_HOST_OPERATIONS: {
  readonly [O in keyof Pages]: Handler<Pages[O]["params"], Pages[O]["result"], Visitor>;
} = {
  pages_open: pagesOpen,
  pages_heads: pagesHeads,
};
