import { readFileSync } from "node:fs";
import { parseSync } from "oxc-parser";
import { failOn, trackedFiles } from "./shared.ts";

interface Comment {
  type: string;
  value: string;
  start: number;
}

interface Finding {
  offset: number;
  message: string;
}

const suppression = /(oxlint|eslint)-(disable|enable)|@ts-(ignore|expect-error|nocheck)/u;

const isSuppression = (comment: Comment): boolean => suppression.test(comment.value);

const isApiDoc = (comment: Comment): boolean => comment.type === "Block" && comment.value.startsWith("*");

const citesExternalSource = (comment: Comment): boolean => /https?:\/\//u.test(comment.value);

const commentFinding = (comment: Comment): Finding[] => {
  if (isSuppression(comment)) return [{ offset: comment.start, message: "remove this suppression and fix the code" }];
  if (isApiDoc(comment) || citesExternalSource(comment)) return [];
  return [{ offset: comment.start, message: "remove this comment; rename, extract or type the code instead" }];
};

const isNode = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const nodesIn = (value: unknown): Record<string, unknown>[] =>
  isNode(value) ? [value, ...Object.values(value).flatMap(nodesIn)] : [];

const dynamicImportFinding = (node: Record<string, unknown>): Finding[] =>
  node.type === "ImportExpression" && typeof node.start === "number"
    ? [{ offset: node.start, message: "use a static import" }]
    : [];

const lineOf = (source: string, offset: number): number => source.slice(0, offset).split("\n").length;

const findingsIn = (file: string): string[] => {
  const source = readFileSync(file, "utf8");
  const { program, comments } = parseSync(file, source);
  return [...comments.flatMap(commentFinding), ...nodesIn(program).flatMap(dynamicImportFinding)].map(
    (finding) => `${file}:${String(lineOf(source, finding.offset))}: ${finding.message}`,
  );
};

const problems = trackedFiles("*.ts", "*.js", "*.mjs").flatMap(findingsIn);

failOn(problems);
