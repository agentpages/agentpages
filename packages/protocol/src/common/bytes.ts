import { BASE64_PATTERN } from "./patterns.js";

const CHUNK_BYTES = 0x80_00;

export const utf8Length = (text: string): number => new TextEncoder().encode(text).length;

const chunksOf = (bytes: Uint8Array): Uint8Array[] =>
  Array.from({ length: Math.ceil(bytes.length / CHUNK_BYTES) }, (_, index) =>
    bytes.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES),
  );

/** `bytes` as the base64 of section 2.1 of the spec. */
export const toBase64 = (bytes: Uint8Array): string =>
  btoa(
    chunksOf(bytes)
      .map((chunk) => String.fromCodePoint(...chunk))
      .join(""),
  );

/** The bytes of a `blob`. It throws a `RangeError` when `blob` is not the base64 of section 2.1 of the spec. */
export const fromBase64 = (blob: string): Uint8Array => {
  if (!BASE64_PATTERN.test(blob)) throw new RangeError("blob must be canonical base64.");
  return Uint8Array.from(atob(blob), (character) => Number(character.codePointAt(0)));
};
