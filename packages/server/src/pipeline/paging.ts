import { DEFAULT_LIMIT, type Paging } from "@agentpages/protocol";
import type { Key, Reader, Value } from "@agentpages/storage";

export interface Listing {
  tx: Reader;
  prefix: Key;
  paging: Paging;
  reverse?: true;
}

export interface Listed {
  rows: [Key, Value][];
  /** Present exactly when more rows exist: the key of the last row, without the prefix. */
  next: { nextCursor: string } | undefined;
}

/** One page of the rows under `prefix`. It reads one row more than it returns, to know whether more exist. */
export const list = async ({ tx, prefix, paging, ...direction }: Listing): Promise<Listed> => {
  const { cursor, limit = DEFAULT_LIMIT } = paging;
  const from = cursor === undefined ? {} : { after: `${prefix}${cursor}` };
  const rows = await tx.scan({ prefix, limit: limit + 1, ...from, ...direction });
  const [next] = rows
    .slice(limit)
    .flatMap(() => rows.slice(limit - 1, limit))
    .map(([key]) => ({ nextCursor: key.slice(prefix.length) }));
  return { rows: rows.slice(0, limit), next };
};
