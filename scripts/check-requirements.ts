import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const tag = /\[([A-Z]+-\d+)\]/gu;

const tagsIn = (text: string): string[] => [...text.matchAll(tag)].map((match) => match[1] ?? "");

const read = (file: string): string => readFileSync(file, "utf8");

const testFiles = (): string[] =>
  execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.test.ts"], { encoding: "utf8" })
    .split("\n")
    .filter((file) => file !== "");

const duplicates = (items: string[]): string[] => items.filter((item, index) => items.indexOf(item) !== index);

const specTags = tagsIn(read("spec/agentpages.md").split("## 1. Scope")[1] ?? "");
const required = new Set(specTags);
const tested = new Set(testFiles().flatMap((file) => tagsIn(read(file))));
const untested = new Set(read("spec/untested.txt").split("\n").filter((line) => line !== ""));

const problems = [
  ...duplicates(specTags).map((id) => `${id}: tagged more than once in the spec`),
  ...[...required].filter((id) => !tested.has(id) && !untested.has(id)).map((id) => `${id}: no test names it`),
  ...[...tested].filter((id) => !required.has(id)).map((id) => `${id}: named by a test but not in the spec`),
  ...[...untested].filter((id) => !required.has(id)).map((id) => `${id}: in untested.txt but not in the spec`),
  ...[...untested].filter((id) => tested.has(id)).map((id) => `${id}: now tested, remove it from untested.txt`),
];

problems.forEach((problem) => {
  console.error(problem);
});
process.exitCode = problems.length === 0 ? 0 : 1;
