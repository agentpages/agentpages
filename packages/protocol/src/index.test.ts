import { expect, test } from "vitest";
import { isFeature } from "./index.js";

test("recognises spec features", () => {
  expect(isFeature("state")).toBe(true);
});

test("rejects unknown features", () => {
  expect(isFeature("camera")).toBe(false);
});
