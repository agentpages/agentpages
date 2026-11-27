import { execFileSync } from "node:child_process";
import { failOn, trackedFiles } from "./shared.ts";

const shard = /^(?<part>\d+)\/(?<parts>\d+)$/u.exec(process.argv[2] ?? "1/1")?.groups;
const part = Number(shard?.part);
const parts = Number(shard?.parts);

const inShard = (_file: string, position: number): boolean => position % parts === part - 1;

const files = trackedFiles("packages/*/src/**/*.ts")
  .filter((file) => !file.endsWith(".test.ts"))
  .filter(inShard);

const run = (): string[] => {
  try {
    execFileSync("stryker", ["run", "--mutate", files.join(",")], { stdio: "inherit" });
    return [];
  } catch {
    return [`Mutation testing failed for shard ${part}/${parts}.`];
  }
};

failOn(part >= 1 && part <= parts ? run() : [`Not a shard: ${process.argv[2]}`]);
