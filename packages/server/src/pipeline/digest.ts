import type { JsonObject } from "@agentpages/protocol";

export type Bytes = Uint8Array<ArrayBuffer>;

export const bytesOf = (text: string): Bytes => new TextEncoder().encode(text);

/** `head` and then `tail`, as one run of bytes. */
export const joined = (head: Bytes, tail: Bytes): Bytes => {
  const all = new Uint8Array(head.length + tail.length);
  all.set(head);
  all.set(tail, head.length);
  return all;
};

export const sha256 = async (bytes: Bytes): Promise<Bytes> => new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));

/** `bytes` in base64 with the alphabet that is safe in a URL, without padding: an id of section 2.1 of the spec. */
export const base64url = (bytes: Bytes): string =>
  btoa(String.fromCodePoint(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const withSortedKeys = (_: string, value: unknown): unknown => {
  if (!isObject(value)) return value;
  const keys = Object.keys(value);
  keys.sort();
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
};

/** The same for two JSON values exactly when they are equal, whatever the order of their keys. */
export const fingerprint = async (value: unknown): Promise<string> =>
  base64url(await sha256(bytesOf(JSON.stringify(value, withSortedKeys))));
