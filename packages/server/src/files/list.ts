import type { FilesListResult, Paging } from "@agentpages/protocol";
import { list, ok, parsed, query } from "../pipeline/index.js";
import { type Filed, toRead } from "../pages/arrival.js";
import { infosPrefix } from "./keys.js";

export const filesList: Filed<Paging, FilesListResult> = (arrival) =>
  query(arrival.schemas, {
    ...toRead(arrival),
    run: async (context, tx) => {
      const { rows, next } = await list({ tx, prefix: infosPrefix(context.target.info.pageId), paging: context.params });
      return ok(parsed(arrival.schemas.result, { files: rows.map(([, stored]) => stored), ...next }));
    },
  });
