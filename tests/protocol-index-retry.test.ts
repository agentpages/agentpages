import { indexBetween, retryWaitMs, TREE_INDEX_PATTERN } from "@agentpages/protocol";
import * as fc from "fast-check";
import { expect, test } from "vitest";
import { counter } from "./support/bridge.ts";
import { numberIn } from "./support/spec.ts";

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Characters that make close neighbours likely, and the ends of the alphabet. */
const digit = fc.oneof(fc.constantFrom("0", "1", "z"), fc.constantFrom(...Array.from(DIGITS)));

const index = fc
  .tuple(fc.array(digit, { maxLength: 4 }), digit.filter((last) => last !== "0"))
  .map(([start, last]) => `${start.join("")}${last}`);

const bound = fc.option(index, { nil: undefined });

interface Bounds {
  after?: string;
  before?: string;
}

const boundsOf = ([after, before]: (string | undefined)[]): Bounds => ({
  ...(after === undefined ? {} : { after }),
  ...(before === undefined ? {} : { before }),
});

const isOrdered = ([after, before]: (string | undefined)[]): boolean =>
  after === undefined || before === undefined || after < before;

const gap = fc.tuple(bound, bound).filter(isOrdered).map(boundsOf);

const draws = fc.array(fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }), { minLength: 1, maxLength: 8 });

/** A random source that returns `values` in turn, again and again. */
const cycling = (values: number[]): (() => number) => {
  const next = counter();
  return () => values[(next() - 1) % values.length] ?? 0;
};

test("[TREE-3] an index between two siblings sorts strictly between them, and is an index of TREE-2 that grows by a few characters at most", () => {
  fc.assert(
    fc.property(gap, draws, (bounds, values) => {
      const made = indexBetween(bounds, cycling(values));
      const { after = "", before = "~" } = bounds;

      expect(made).toMatch(TREE_INDEX_PATTERN);
      expect([after < made, made < before]).toStrictEqual([true, true]);
      expect(made.length).toBeLessThanOrEqual(Math.max(after.length, before.length) + 5);
    }),
  );
});

test.each<[Bounds, string]>([
  [{}, "V"],
  [{ after: "a", before: "b" }, "aV"],
  [{ after: "a", before: "a01" }, "a00V"],
  [{ after: "az", before: "b" }, "azV"],
  [{ after: "z" }, "zV"],
  [{ before: "1" }, "0V"],
  [{ after: "", before: "3" }, "1"],
])("[TREE-3] between %o the index starts with %s, the shortest that leaves room on both sides", (bounds, start) => {
  expect([indexBetween(bounds, () => 0), indexBetween(bounds, () => 1 - Number.EPSILON)]).toStrictEqual([
    `${start}1111`,
    `${start}zzzz`,
  ]);
});

const ending = fc.array(fc.integer({ min: 0, max: 60 }), { minLength: 4, maxLength: 4 });

const differentEndings = fc.tuple(ending, ending).filter(([one, other]) => one.join(",") !== other.join(","));

/** A random source that draws these of the 61 characters an index can end in. */
const drawn = (characters: number[]): (() => number) => cycling(characters.map((character) => (character + 0.5) / 61));

test("[TREE-3] two clients that insert at the same place with different random characters pick different indexes", () => {
  fc.assert(
    fc.property(gap, differentEndings, (bounds, [one, other]) => {

      expect(indexBetween(bounds, drawn(one))).not.toBe(indexBetween(bounds, drawn(other)));
    }),
  );
});

test.each<Bounds>([
  { after: "a", before: "a" },
  { after: "b", before: "a" },
  { after: "a1", before: "a" },
  { after: "a0" },
  { after: "a", before: "b0" },
  { before: "0" },
  { before: "" },
  { after: "a b" },
  { before: "é" },
])("[TREE-2] there is no index between %o: both must be indexes, the first before the second", (bounds) => {
  expect(() => indexBetween(bounds, () => 0.5)).toThrow(new RangeError("after and before must be indexes, with after < before."));
});

const BASE_MS = numberIn(/between 0 and `(\d+) × 2ⁿ` milliseconds/u);

const attempt = fc.integer({ min: 0, max: 5 });

const retry = fc.record({ attempt, retryAfterMs: fc.integer({ min: 0, max: 60_000 }) });

const share = fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true });

test("[REL-12] the wait before retry n is retryAfterMs plus a random share of 250 × 2ⁿ milliseconds", () => {
  fc.assert(
    fc.property(retry, share, ({ attempt: n, retryAfterMs }, random) => {
      const wait = retryWaitMs({ attempt: n, retryAfterMs }, () => random);

      expect(wait).toBeGreaterThanOrEqual(retryAfterMs);
      expect(wait).toBeLessThanOrEqual(retryAfterMs + BASE_MS * 2 ** n);
      expect(retryWaitMs({ attempt: n, retryAfterMs }, () => 0.5)).toBe(retryAfterMs + (BASE_MS * 2 ** n) / 2);
    }),
  );
});

test("[REL-12] without retryAfterMs the wait is the random time alone", () => {
  fc.assert(
    fc.property(attempt, share, (n, random) => {
      expect(retryWaitMs({ attempt: n }, () => random)).toBe(retryWaitMs({ attempt: n, retryAfterMs: 0 }, () => random));
      expect(retryWaitMs({ attempt: n }, () => 0.5)).toBe((BASE_MS * 2 ** n) / 2);
    }),
  );
});
