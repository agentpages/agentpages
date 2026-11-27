import type { Capability } from "./types.js";

/** What the request cap leaves for escaping, text fields, schemas and the envelope of a request. */
export const REQUEST_CAP_SLACK_BYTES = 1_048_576;

const base64Length = (bytes: number): number => Math.ceil(bytes / 3) * 4;

const largestPayload = ({ limits, state, files }: Capability): number =>
  Math.max(
    limits.maxHtmlBytes,
    base64Length(files?.maxFileBytes ?? 0),
    (state?.maxOpsPerCommit ?? 0) * (state?.maxDocumentBytes ?? 0),
  );

/** The request cap of a Store, in bytes: a transport refuses a larger body before the Store sees it. */
export const maxRequestBytes = (capability: Capability): number =>
  2 * largestPayload(capability) + REQUEST_CAP_SLACK_BYTES;
