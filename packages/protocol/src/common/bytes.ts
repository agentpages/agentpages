const GROUP_CHARACTERS = 4;

const OUTSIDE_ALPHABET = /[^A-Za-z0-9+/]/u;

/** The last group of canonical base64: the bits its padding does not use are zero. */
const LAST_GROUP = /^(?:[A-Za-z0-9+/]{4}|[A-Za-z0-9+/][AQgw]==|[A-Za-z0-9+/]{2}[AEIMQUYcgkosw048]=)?$/u;

/**
 * Whether `text` is the base64 of section 2.1 of the spec: the standard alphabet with padding, in canonical form. It
 * takes time in proportion to the length of `text`, however long.
 */
export const isBase64 = (text: string): boolean =>
  text.length % GROUP_CHARACTERS === 0 && LAST_GROUP.test(text.slice(-GROUP_CHARACTERS)) && !OUTSIDE_ALPHABET.test(text.slice(0, -GROUP_CHARACTERS));

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
  if (!isBase64(blob)) throw new RangeError("blob must be canonical base64.");
  return Uint8Array.from(atob(blob), (character) => Number(character.codePointAt(0)));
};
