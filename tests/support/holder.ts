import { once } from "node:events";
import { openSqliteStorage } from "@agentpages/sqlite";

/** Holds the lock `lock` of the storage in the file it is given until its input ends, then puts `held`. */
const storage = openSqliteStorage({ path: String(process.argv[2]), clock: { now: () => 0 }, leaseMs: 60_000, retryMs: 1 });

await storage.transact(["lock"], async (tx) => {
  process.stdout.write("holding\n");
  await once(process.stdin.resume(), "end");
  tx.put("held", {});
});
storage.close();
