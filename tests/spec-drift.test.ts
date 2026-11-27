import { readFileSync } from "node:fs";
import { EXTENSION_ID, FEATURES, isFeature, PROTOCOL_VERSION } from "@agentpages/protocol";
import { expect, test } from "vitest";

const spec = readFileSync(new URL("../spec/agentpages.md", import.meta.url), "utf8");

const advertisedCapability = (): unknown => {
  const example = /```json\n([\s\S]*?)```/u.exec(spec);
  return JSON.parse(example?.[1] ?? "") as unknown;
};

test("the spec is the version the package implements", () => {
  expect(spec).toContain(`Version ${PROTOCOL_VERSION} `);
});

test("the spec advertises the package's extension, version and features", () => {
  const features = Object.fromEntries(FEATURES.map((feature) => [feature, expect.any(Object) as unknown]));

  expect(advertisedCapability()).toStrictEqual({
    [EXTENSION_ID]: { version: PROTOCOL_VERSION, limits: expect.any(Object) as unknown, ...features },
  });
});

test("only spec features are recognised", () => {
  expect(FEATURES.every(isFeature)).toBe(true);
  expect(isFeature("camera")).toBe(false);
});
