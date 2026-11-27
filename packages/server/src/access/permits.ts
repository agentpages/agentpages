import type { PageInfo } from "@agentpages/protocol";
import type { Principal } from "./principal.js";

/** What an operation needs of a page. An owner's operations need `owner`. */
export const NEED = { read: "read", write: "write", owner: "owner" } as const;

export type Need = keyof typeof NEED;

export interface Permit {
  principal: Principal;
  page: { owner: unknown; access: PageInfo["access"]; url: string };
  need: Need;
}

const linkGrants = ({ page: { access }, need }: Permit): boolean =>
  access !== "private" && (need === NEED.read || (need === NEED.write && access === "link-write"));

/** The access table of section 5.1 of the spec. */
export const permits = (permit: Permit): boolean => {
  const { principal, page, need } = permit;
  const { subject }: { kind: string; subject?: string } = principal;
  if (principal.kind === "agent") return subject === page.owner;
  if (subject === page.owner) return need !== NEED.owner;
  return principal.url === page.url && linkGrants(permit);
};
