import { expect, test } from "vitest";
import { isCapability } from "./index.js";

test("recognises declared capabilities", () => {
  expect(isCapability("storage")).toBe(true);
});

test("rejects unknown capabilities", () => {
  expect(isCapability("camera")).toBe(false);
});
