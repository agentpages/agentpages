import { type FilesGetParams, type FilesGetResult, toBase64 } from "@agentpages/protocol";
import { bytesOf, ok, parsed, query, refuse } from "../pipeline/index.js";
import { type Filed, toRead } from "./arrival.js";
import { fileKeys } from "./keys.js";

export const filesGet: Filed<FilesGetParams, FilesGetResult> = (arrival) =>
  query(arrival.schemas, {
    ...toRead(arrival),
    run: async ({ params, target }, tx) => {
      const [file, stored] = await tx.getMany(fileKeys({ pageId: target.info.pageId, id: params.id }));
      if (file === undefined) return refuse({ error: "NotFound", message: `The page has no file ${params.id}.` });
      return ok(parsed(arrival.schemas.result, { file, blob: toBase64(bytesOf(stored)) }));
    },
  });
