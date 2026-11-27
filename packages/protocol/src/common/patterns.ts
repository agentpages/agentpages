export const ID_PATTERN: RegExp = /^[A-Za-z0-9_-]{1,128}$/u;

export const UUID_PATTERN: RegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export const TIMESTAMP_PATTERN: RegExp =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;

export const TREE_INDEX_PATTERN: RegExp = /^[0-9A-Za-z]*[1-9A-Za-z]$/u;

export const BASE64_PATTERN: RegExp = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

/** `title`, `name` and `mimeType`: 1 to 255 characters, counted as Unicode code points. */
export const NAME_PATTERN: RegExp = /^[\s\S]{1,255}$/u;

/** `description` and `quote`: at most 1024 characters. */
export const DESCRIPTION_PATTERN: RegExp = /^[\s\S]{0,1024}$/u;

/** `body` and `instructions`: at most 65536 characters. */
export const BODY_PATTERN: RegExp = /^[\s\S]{0,65536}$/u;

export const VERSION_PATTERN: RegExp = /^\d+\.\d+$/u;
