import { expect, test } from "vitest";
import type { Driver } from "../contract.js";
import { ACCESS_CASES, HOST_CASES } from "./access.js";
import { COMMON_CASES } from "./common.js";
import type { Cases } from "./kit.js";
import { PAGES_CASES } from "./pages.js";
import { RETRY_CASES } from "./retries.js";
import { TYPES_CASES } from "./types.js";

export type MakeDriver = () => Driver | Promise<Driver>;

const CASES: Cases = {
  ...COMMON_CASES,
  ...ACCESS_CASES,
  ...PAGES_CASES,
  ...HOST_CASES,
  ...TYPES_CASES,
  ...RETRY_CASES,
};

/**
 * Registers the tests of a Store. `make` returns a driver of a new, empty Store each time. Every title starts with
 * the requirement of the spec the test proves.
 */
export const storeSuite = (make: MakeDriver): void => {
  test.each(Object.entries(CASES))("%s", async (_, run) => {
    const check = await run(await make());

    expect(check).toStrictEqual({ got: check.want, want: check.want });
  });
};
