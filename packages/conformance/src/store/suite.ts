import { expect, test } from "vitest";
import type { Driver } from "../contract.js";
import { casesOf } from "./cases.js";
import { met } from "./kit.js";

export type MakeDriver = () => Driver;

/**
 * Registers the tests of a Store. `make` returns a driver of a new, empty Store each time, and every Store it returns
 * advertises the same capability: the features of the first one decide which tests are registered. Every title starts
 * with the requirement of the spec the test proves.
 */
export const storeSuite = (make: MakeDriver): void => {
  test.each(Object.entries(casesOf(make().capability)))("%s", async (_, run) => {
    const check = await run(make());

    expect(check).toStrictEqual(met(check));
  });
};
