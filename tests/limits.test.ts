import {
  base64Size,
  commitLimitProblem,
  commitProblem,
  fileProblem,
  htmlProblem,
  type Limits,
  type Op,
  viewportProblem,
} from "@agentpages/protocol";
import * as fc from "fast-check";
import { expect, test } from "vitest";

const LIMITS: Limits = {
  requestTimeoutMs: 1,
  syncIntervalMs: 1,
  exportTimeoutMs: 1,
  maxHtmlBytes: 1,
  opRetentionSeconds: 1,
  commitRetentionSeconds: 1,
};

const texts = fc.string({ unit: fc.constantFrom("a", "é", "\u{1F600}", '"'), maxLength: 6 });

interface Place {
  collection: string;
  id: string;
}

const places: fc.Arbitrary<Place> = fc.record({ collection: fc.constantFrom("a", "b"), id: fc.constantFrom("x", "y", "z") });

const deleteAt = (place: Place): Op => ({ op: "delete", ...place });

const putAt = ([place, text]: [Place, string]): Op => ({ op: "put", ...place, data: { text } });

const ops: fc.Arbitrary<Op[]> = fc.array(fc.oneof(places.map(deleteAt), fc.tuple(places, texts).map(putAt)), {
  maxLength: 5,
});

const keyOf = (op: Op): string => JSON.stringify([op.collection, op.id]);

const bytesOf = (op: Op): number => (op.op === "put" ? Buffer.byteLength(JSON.stringify(op.data)) : 0);

const repeatAt = (commit: Op[]): number =>
  commit.findIndex((op, index) => commit.slice(0, index).map(keyOf).includes(keyOf(op)));

const about = (text: string): unknown => expect.stringContaining(text);

interface StateLimits {
  maxOpsPerCommit: number;
  maxDocumentBytes: number;
}

/** What section 4.1 says makes a commit malformed, read independently of the package. */
const expectedProblem = (commit: Op[], limits: StateLimits): unknown => {
  if (commit.length > limits.maxOpsPerCommit) return { error: "InvalidParams", message: about(`${commit.length} ops`) };
  if (repeatAt(commit) === -1) return undefined;
  return { error: "InvalidParams", message: about(`op ${repeatAt(commit)} `), opIndex: repeatAt(commit) };
};

/** What section 4.1 says of a commit whose data is too large. */
const expectedLimitProblem = (commit: Op[], limits: StateLimits): unknown => {
  const opIndex = commit.findIndex((op) => bytesOf(op) > limits.maxDocumentBytes);
  return opIndex === -1 ? undefined : { error: "LimitExceeded", message: about(`op ${opIndex} `), opIndex };
};

interface Sizes {
  width: number;
  height: number;
  maxWidth: number;
  maxHeight: number;
}

const fits = ({ width, height, maxWidth, maxHeight }: Sizes): boolean => width <= maxWidth && height <= maxHeight;

test("a commit is malformed when it has too many ops or two on one document, and too large apart from that", () => {
  const limits = fc.record({ maxOpsPerCommit: fc.nat(6), maxDocumentBytes: fc.integer({ min: 9, max: 30 }) });

  fc.assert(
    fc.property(ops, limits, (commit, chosen) => {
      const check = { ops: commit, limits: { ...chosen, liveChanges: true } };

      expect(commitProblem(check)).toStrictEqual(expectedProblem(commit, chosen));
      expect(commitLimitProblem(check)).toStrictEqual(expectedLimitProblem(commit, chosen));
    }),
    { numRuns: 500 },
  );
});

test("a commit's problem names the limit it broke", () => {
  const big: Op = { op: "put", collection: "a", id: "x", data: { text: "four" } };
  const limits = { maxOpsPerCommit: 1, maxDocumentBytes: 14, liveChanges: false };

  expect(commitProblem({ ops: [big, big], limits })?.message).toContain("maxOpsPerCommit 1");
  expect(commitLimitProblem({ ops: [big], limits })?.message).toContain("maxDocumentBytes 14");
  expect(commitLimitProblem({ ops: [big], limits: { ...limits, maxDocumentBytes: 15 } })).toBeUndefined();
});

test("the size of a file is the decoded length of its blob", () => {
  fc.assert(
    fc.property(fc.uint8Array({ maxLength: 40 }), fc.nat(40), (bytes, maxFileBytes) => {
      const blob = Buffer.from(bytes).toString("base64");
      const problem = fileProblem({ blob, limits: { maxFileBytes } });

      expect(base64Size(blob)).toBe(bytes.length);
      expect(problem === undefined).toBe(bytes.length <= maxFileBytes);
    }),
  );
});

test("a file larger than the Store's limit exceeds it", () => {
  const problem = fileProblem({ blob: "AAAAAA==", limits: { maxFileBytes: 3 } });

  expect(problem).toStrictEqual({ error: "LimitExceeded", message: about("4 bytes") });
  expect(problem?.message).toContain("maxFileBytes 3");
});

test("html larger than the Store's limit, in UTF-8 bytes, exceeds it", () => {
  fc.assert(
    fc.property(texts, fc.nat(24), (html, maxHtmlBytes) => {
      const problem = htmlProblem({ html, limits: { ...LIMITS, maxHtmlBytes } });

      expect(problem === undefined).toBe(Buffer.byteLength(html) <= maxHtmlBytes);
    }),
  );

  const problem = htmlProblem({ html: "éé", limits: { ...LIMITS, maxHtmlBytes: 3 } });

  expect(problem).toStrictEqual({ error: "LimitExceeded", message: about("4 bytes") });
  expect(problem?.message).toContain("maxHtmlBytes 3");
});

test("a viewport wider or taller than the Store's limit exceeds it", () => {
  const sizes = fc.record({ width: fc.nat(4), height: fc.nat(4), maxWidth: fc.nat(4), maxHeight: fc.nat(4) });

  fc.assert(
    fc.property(sizes, (chosen) => {
      const limits = { ...chosen, maxDocumentHeight: 1, settleTimeoutMs: 1 };
      const problem = viewportProblem({ viewport: chosen, limits });

      expect(problem === undefined).toBe(fits(chosen));
    }),
  );
});

test("a viewport's problem names both sizes", () => {
  const limits = { maxWidth: 1920, maxHeight: 1080, maxDocumentHeight: 1, settleTimeoutMs: 1 };

  expect(viewportProblem({ viewport: { width: 1921, height: 600 }, limits })).toStrictEqual({
    error: "LimitExceeded",
    message: expect.stringMatching(/1921x600.*1920x1080/u) as unknown,
  });
});
