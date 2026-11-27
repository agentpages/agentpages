import type { Actor, Viewer } from "@agentpages/protocol";
import { base64url, bytesOf, sha256 } from "../pipeline/digest.js";
import type { Principal, Visitor } from "./principal.js";

const MIN_KEY_BYTES = 32;
const BLOCK_BYTES = 64;
const INNER_PAD = 0x36;
const OUTER_PAD = 0x5c;

/**
 * HMAC-SHA-256, as https://www.rfc-editor.org/rfc/rfc2104 defines it. It needs nothing of the platform but its
 * SHA-256.
 */
const hmac = async (key: number[], message: number[]): Promise<number[]> => {
  const block = key.length > BLOCK_BYTES ? await sha256(key) : key;
  const padded = (pad: number): number[] => Array.from({ length: BLOCK_BYTES }, (_, at) => (block[at] ?? 0) ^ pad);
  return sha256([...padded(OUTER_PAD), ...(await sha256([...padded(INNER_PAD), ...message]))]);
};

/** Who makes a request, and the page the request names when it names one. */
interface Seen<Who extends Principal = Principal> {
  principal: Who;
  pageId: string | undefined;
}

/**
 * How a Store names who makes a request. The id of a viewer is the HMAC of the page and the subject under the key of
 * the Store: the same on one page, another on every other page, and not the subject.
 */
export interface Actors {
  /** Who a commit or a log record names. */
  actorOf(seen: Seen): Promise<Actor>;
  /** A viewer as `identity/get` shows them: under the id of their `Actor`, with their name if they have one. */
  viewerOf(seen: Seen<Visitor>): Promise<Viewer | null>;
}

const named = ({ name }: { name?: string }): { name?: string } => (name === undefined ? {} : { name });

/** The actors of a Store with this `actorKey`. It throws when the key is shorter than 32 bytes. */
export const actorsUnder = (actorKey: string): Actors => {
  const key = bytesOf(actorKey);
  if (key.length < MIN_KEY_BYTES) throw new RangeError("actorKey must be at least 32 bytes.");
  const idOf = async (subject: string, pageId = ""): Promise<string> => base64url(await hmac(key, bytesOf(`${pageId}/${subject}`)));
  return {
    actorOf: async ({ principal, pageId }) =>
      principal.kind === "viewer" ? { kind: "viewer", id: await idOf(principal.subject, pageId) } : { kind: principal.kind },
    viewerOf: async ({ principal, pageId }) =>
      principal.kind === "viewer" ? { id: await idOf(principal.subject, pageId), ...named(principal) } : null,
  };
};
