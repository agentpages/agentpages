import { counted, type Remembered } from "../pipeline/index.js";
import type { Key } from "@agentpages/storage";

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

/** Where a type keeps the requests it remembers. */
export const rememberedBy = (typeId: string): Remembered => ({ prefix: `${typePrefix(typeId)}op/`, lock: typeKey(typeId) });
