import { execFileSync } from "node:child_process";

export const trackedFiles = (...patterns: string[]): string[] =>
  execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", ...patterns], { encoding: "utf8" })
    .split("\n")
    .filter((file) => file !== "");

export const failOn =(problems: string[]): void => {
  problems.forEach((problem) => {
    console.error(problem);
  });
  process.exitCode = problems.length === 0 ? 0 : 1;
};
