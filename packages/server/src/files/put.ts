import { fileProblem, type FilesLimits, type FilesPutParams, type FilesPutResult, fromBase64 } from "@agentpages/protocol";
import { mutation, ok } from "../pipeline/index.js";
import { type Filed, toChange } from "../pages/arrival.js";
import { saveFile } from "./save.js";

/** `files/put` of a Store with these limits. The limit is on the decoded size, and is decided before a reused `opId`. */
export const filesPut =
  (limits: FilesLimits): Filed<FilesPutParams, FilesPutResult> =>
  (arrival) =>
    mutation(arrival.schemas, {
      ...toChange(arrival),
      limits: ({ blob }) => fileProblem({ blob, limits }),
      run: async (context, tx) => {
        const { blob, ...named } = context.params;
        return ok({ file: await saveFile(tx, { context, named, bytes: fromBase64(blob) }) });
      },
    });
