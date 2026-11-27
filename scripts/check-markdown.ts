import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const allowedPlaces = [
  /^[A-Z]+\.md$/u,
  /^spec\/[a-z-]+\.md$/u,
  /^(.+\/)?README\.md$/u,
  /^packages\/[a-z-]+\/CHANGELOG\.md$/u,
  /^\.changeset\/[^/]+\.md$/u,
  /^\.github\/pull_request_template\.md$/u,
  /^packages\/[a-z-]+\/[a-z-]+\.api\.md$/u,
];

const isInDocsFolder = (file: string): boolean => file.split("/").includes("docs");

const listMarkdownFiles = (): string[] =>
  execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.md"], { encoding: "utf8" })
    .split("\n")
    .filter((file) => file !== "" && existsSync(file));

const isMisplaced = (file: string): boolean =>
  isInDocsFolder(file) || !allowedPlaces.some((place) => place.test(file));

const relativeLinks = (file: string): string[] =>
  [...readFileSync(file, "utf8").matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/gu)]
    .map((match) => match[1] ?? "")
    .filter((target) => !/^[a-z]+:/u.test(target));

const brokenLinks = (file: string): string[] =>
  relativeLinks(file)
    .filter((target) => !existsSync(resolve(dirname(file), target)))
    .map((target) => `${file}: broken link to ${target}`);

const files = listMarkdownFiles();
const problems = [
  ...files.filter(isMisplaced).map((file) => `${file}: markdown is not allowed here; use a README.md in the folder it describes`),
  ...files.flatMap(brokenLinks),
];

problems.forEach((problem) => {
  console.error(problem);
});
process.exitCode = problems.length === 0 ? 0 : 1;
