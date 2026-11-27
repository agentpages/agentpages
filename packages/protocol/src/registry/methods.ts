import type { Feature } from "../extension/constants.js";
import type { FilesMethods } from "../files/methods.js";
import type { IdentityMethods } from "../identity/methods.js";
import type { StateMethods } from "../state/methods.js";
import type { Committed } from "../state/types.js";
import type { ViewMethods } from "../view/methods.js";

/** Every request of the view extension, in either direction. */
export interface Methods extends StateMethods, IdentityMethods, FilesMethods, ViewMethods {}

export type MethodName = keyof Methods;

export interface Notifications {
  "agentpages/state/committed": { params: Committed };
}

export type NotificationName = keyof Notifications;

/** Which feature a message belongs to, if any, and which side receives it. */
export interface Route {
  readonly feature: Feature | null;
  readonly to: "host" | "view";
}

export type Mutates<Params> = Params extends { opId: string } ? true : false;

export interface MethodInfo<M extends MethodName> extends Route {
  readonly mutates: Mutates<Methods[M]["params"]>;
}

export const METHODS: { readonly [M in MethodName]: MethodInfo<M> } = {
  "agentpages/state/get": { feature: "state", to: "host", mutates: false },
  "agentpages/state/list": { feature: "state", to: "host", mutates: false },
  "agentpages/state/commit": { feature: "state", to: "host", mutates: true },
  "agentpages/state/commits": { feature: "state", to: "host", mutates: false },
  "agentpages/identity/get": { feature: "identity", to: "host", mutates: false },
  "agentpages/files/put": { feature: "files", to: "host", mutates: true },
  "agentpages/files/get": { feature: "files", to: "host", mutates: false },
  "agentpages/files/list": { feature: "files", to: "host", mutates: false },
  "agentpages/files/delete": { feature: "files", to: "host", mutates: true },
  "agentpages/view/reveal": { feature: null, to: "view", mutates: false },
  "agentpages/view/export": { feature: null, to: "view", mutates: false },
};

export const NOTIFICATIONS: { readonly [N in NotificationName]: Route } = {
  "agentpages/state/committed": { feature: "state", to: "view" },
};
