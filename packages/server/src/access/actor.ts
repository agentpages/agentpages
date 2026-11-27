import type { Actor, Viewer } from "@agentpages/protocol";
import { digest } from "../pipeline/digest.js";
import type { Principal, Visitor } from "./principal.js";

/** Who a log record names. A viewer's id is a digest of the subject: the same everywhere, and not the subject. */
export const actorOf = async (principal: Principal): Promise<Actor> =>
  principal.kind === "viewer" ? { kind: "viewer", id: await digest(principal.subject) } : { kind: principal.kind };

const named = ({ name }: { name?: string }): { name?: string } => (name === undefined ? {} : { name });

/** A viewer as `identity/get` shows them: under the id of their `Actor`, with their name if they have one. */
export const viewerOf = async (visitor: Visitor): Promise<Viewer | null> =>
  visitor.kind === "anonymous" ? null : { id: await digest(visitor.subject), ...named(visitor) };
