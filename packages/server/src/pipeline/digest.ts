import type { JsonObject } from "@agentpages/protocol";

export const bytesOf = (text: string): number[] => [...new TextEncoder().encode(text)];

export const sha256 = async (bytes: number[]): Promise<number[]> => [
  ...new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes))),
];

/** `bytes` in base64 with the alphabet that is safe in a URL, without padding: an id of section 2.1 of the spec. */
export const base64url = (bytes: number[]): string =>
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
