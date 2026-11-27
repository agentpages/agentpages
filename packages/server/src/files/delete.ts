import type { Empty, FilesDeleteParams } from "@agentpages/protocol";
import { mutation, ok } from "../pipeline/index.js";
import { type Filed, toChange } from "../pages/arrival.js";
import { fileKeys } from "./keys.js";

/** Section 4.4 of the spec: the delete of a missing file succeeds. */
export const filesDelete: Filed<FilesDeleteParams, Empty> = (arrival) =>
  mutation(arrival.schemas, {
    ...toChange(arrival),
    run: ({ params, target }, tx) => {
      fileKeys({ pageId: target.info.pageId, id: params.id }).forEach((key) => {
        tx.delete(key);
      });
      return Promise.resolve(ok({}));
    },
  });
