import { TREE_INDEX_PATTERN } from "../common/patterns.js";

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const ENDINGS = DIGITS.slice(1);

const RANDOM_CHARACTERS = 4;

interface Gap {
  after: string;
  before: string | undefined;
}

/** The digit of an index at a place. Past its end an index goes on in zeros, which change nothing of its order. */
const digitAt = (index: string, at: number): number => DIGITS.indexOf(index.charAt(at));

/** A short index strictly between the two, which no index that starts with it leaves. It goes on from `start`. */
const startBetween = (gap: Gap, start: string): string => {
  const low = digitAt(gap.after, start.length);
  const high = gap.before === undefined ? DIGITS.length : digitAt(gap.before, start.length);
  if (high - low > 1) return start + DIGITS.charAt(Math.floor((low + high) / 2));
  return startBetween(high === low ? gap : { after: gap.after, before: undefined }, start + DIGITS.charAt(low));
};

const randomEnding = (random: () => number): string =>
  Array.from({ length: RANDOM_CHARACTERS }, () => ENDINGS.charAt(Math.floor(random() * ENDINGS.length))).join("");

const isIndex = (index: string): boolean => TREE_INDEX_PATTERN.test(index);

/**
 * An index that sorts strictly between two siblings, ending in random characters (section 4.2). Without `after` it
 * sorts before `before`, without `before` after `after`. `random` returns a number from 0 to 1, 1 excluded. Throws
 * `RangeError` unless both are indexes and `after < before`.
 */
export const indexBetween = (bounds: { after?: string; before?: string }, random: () => number): string => {
  const { after = "", before } = bounds;
  const ordered = (after === "" || isIndex(after)) && (before === undefined || (isIndex(before) && after < before));
  if (!ordered) throw new RangeError("after and before must be indexes, with after < before.");
  return startBetween({ after, before }, "") + randomEnding(random);
};
