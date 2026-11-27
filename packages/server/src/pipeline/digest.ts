import type { JsonObject } from "@agentpages/protocol";

const HEX = 16;

/** The SHA-256 of `text`, in hexadecimal. */
export const digest = async (text: string): Promise<string> => {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(HEX).padStart(2, "0")).join("");
};

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const withSortedKeys = (_: string, value: unknown): unknown => {
  if (!isObject(value)) return value;
  const keys = Object.keys(value);
  keys.sort();
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
};

/** The same for two JSON values exactly when they are equal, whatever the order of their keys. */
export const fingerprint = (value: unknown): Promise<string> => digest(JSON.stringify(value, withSortedKeys));
