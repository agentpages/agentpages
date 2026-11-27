import type { Actor } from "@agentpages/protocol";
import { digest } from "../pipeline/digest.js";
import type { Principal } from "./principal.js";

/** Who a log record names. A viewer's id is a digest of the subject: the same everywhere, and not the subject. */
export const actorOf = async (principal: Principal): Promise<Actor> =>
  principal.kind === "viewer" ? { kind: "viewer", id: await digest(principal.subject) } : { kind: principal.kind };
