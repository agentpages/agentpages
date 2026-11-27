import type { LogRecord } from "@agentpages/protocol";

export interface Logger {
  log(record: LogRecord): void;
}
