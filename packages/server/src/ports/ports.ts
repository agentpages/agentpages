import type { SchemaCompiler } from "./compiler.js";
import type { Ids } from "./ids.js";
import type { RateLimiter } from "./limiter.js";
import type { Logger } from "./logger.js";
import type { Clock, Storage } from "@agentpages/storage";

/** Everything a Store needs from the outside. */
export interface Ports {
  storage: Storage;
  clock: Clock;
  ids: Ids;
  logger: Logger;
  limiter: RateLimiter;
  compiler: SchemaCompiler;
}
