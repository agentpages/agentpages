import { counted } from "../pipeline/index.js";
import type { Key } from "../ports/storage.js";

/** The current version of every type, by `typeId`. */
export const TYPES_PREFIX: Key = "types/";

/** A type as `types_list` shows it, with its owner. It is also the lock of the type. */
export const typeKey = (typeId: string): Key => `${TYPES_PREFIX}${typeId}`;

const typePrefix = (typeId: string): Key => `type/${typeId}/`;

/** One version as `types_get` returns it. */
export const typeVersionKey = ({ typeId, typeVersion }: { typeId: string; typeVersion: number }): Key =>
  `${typePrefix(typeId)}v/${counted(typeVersion)}`;

/** The type with every collection any of its versions declared. */
export const declaredKey = (typeId: string): Key => `${typePrefix(typeId)}declared`;

export const rememberedPrefix = (typeId: string): Key => `${typePrefix(typeId)}op/`;
