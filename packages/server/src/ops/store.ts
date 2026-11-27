import {
  type Answer,
  type Capability,
  CapabilitySchema,
  hasFeature,
  METHOD_NOT_FOUND,
  PROTOCOL_VERSION,
  TOOLS,
  validate,
} from "@agentpages/protocol";
import type { Agent, Visitor } from "../access/principal.js";
import type { Ports } from "../ports/ports.js";
import type { Handler, Shown } from "../pipeline/index.js";
import { HOST_HANDLERS, methodsOf, toolsOf } from "./operations.js";

export interface StoreConfig {
  /** The limits and the features the Store advertises. */
  capability: Omit<Capability, "version">;
  /** What every page `url` starts with: a URL, such as `https://pages.example/p/`. */
  baseUrl: string;
}

export interface ToolCall {
  tool: string;
  input: unknown;
  principal: Agent;
}

export interface HostCall {
  operation: string;
  input: unknown;
  principal: Visitor;
  /** The id the host chose for the request, as section 2.1 of the spec defines one. */
  requestId: string;
}

export interface ViewCall {
  method: string;
  params: unknown;
  /** The page link the host holds for the view. It names the page and is the link the viewer presents. */
  url: string;
  principal: Visitor;
  /** The id the host chose for the request. */
  requestId: string;
}

export interface Store {
  /** What the Store advertises under the extension identifier. */
  readonly capability: Capability;
  /** The tools the Store lists: those whose features it advertises. */
  readonly tools: readonly string[];
  /** Answers a tool call of an agent. */
  call(request: ToolCall): Promise<Answer>;
  /** Answers an operation a host runs for a viewer. */
  host(request: HostCall): Promise<Answer>;
  /** Answers a method a view calls on its host. A method of a feature the Store does not advertise is unknown. */
  view(request: ViewCall): Promise<Answer>;
}

/** Handlers by the name a request asks for them under. A name of `Object.prototype` is not one of them. */
const byName = <H>(handlers: Record<string, H>): Map<string, H> => new Map(Object.entries(handlers));

const unknownMethod = (): Promise<Answer> => Promise.resolve({ kind: "unknown-method", code: METHOD_NOT_FOUND });

const listed = (capability: Capability): string[] =>
  Object.entries(TOOLS)
    .filter(([, { requires }]) => requires.every((feature) => hasFeature(capability, feature)))
    .map(([tool]) => tool);

/** What the Store advertises, once it is known to be a capability of section 3 of the spec that a Store can keep. */
const advertised = (config: StoreConfig): Capability => {
  const checked = validate(CapabilitySchema, { version: PROTOCOL_VERSION, ...config.capability });
  if (!checked.ok) throw new TypeError(`The capability is not valid: ${JSON.stringify(checked.issues)}`);
  const { opRetentionSeconds, commitRetentionSeconds } = checked.value.limits;
  if (commitRetentionSeconds < opRetentionSeconds) {
    throw new RangeError("commitRetentionSeconds must be at least opRetentionSeconds.");
  }
  return checked.value;
};

/** A Store over the given ports. All it keeps is in `ports.storage`. It throws when `config` is not valid. */
export const createStore = (ports: Ports, config: StoreConfig): Store => {
  const capability = advertised(config);
  if (!URL.canParse(config.baseUrl)) throw new TypeError("baseUrl must be a URL.");
  const deps = { ...ports, capability, baseUrl: config.baseUrl };
  const tools = byName<Handler<unknown, unknown, Agent>>(toolsOf(capability));
  const operations = byName<Handler<unknown, unknown, Visitor>>(HOST_HANDLERS);
  const methods = byName<Shown<unknown, unknown>>(methodsOf(capability));
  return {
    capability,
    tools: listed(capability),
    call: ({ tool, input, principal }) =>
      tools.get(tool)?.answer({ deps, method: tool, input, principal, requestId: ports.ids.id() }) ?? unknownMethod(),
    host: ({ operation, input, principal, requestId }) =>
      operations.get(operation)?.answer({ deps, method: operation, input, principal, requestId }) ?? unknownMethod(),
    view: ({ method, params, url, principal, requestId }) =>
      methods.get(method)?.(url).answer({ deps, method, input: params, principal, requestId }) ?? unknownMethod(),
  };
};
