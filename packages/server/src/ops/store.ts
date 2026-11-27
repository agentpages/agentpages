import {
  type Capability,
  hasFeature,
  HOST_OPERATIONS,
  METHOD_NOT_FOUND,
  PROTOCOL_VERSION,
  TOOLS,
} from "@agentpages/protocol";
import type { Agent, Visitor } from "../access/principal.js";
import type { Answer } from "../pipeline/answer.js";
import type { Ports } from "../ports/ports.js";
import { type HostOperationReady, OPERATIONS, type ToolReady } from "./operations.js";

export interface StoreConfig {
  /** The limits and the features the Store advertises. */
  capability: Omit<Capability, "version">;
  /** What every page `url` starts with, such as `https://pages.example/p/`. */
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
}

const isReadyTool = (tool: string): tool is ToolReady => Object.hasOwn(TOOLS, tool) && Object.hasOwn(OPERATIONS, tool);

const isReadyHostOperation = (operation: string): operation is HostOperationReady =>
  Object.hasOwn(HOST_OPERATIONS, operation) && Object.hasOwn(OPERATIONS, operation);

const unknownMethod = (): Promise<Answer> => Promise.resolve({ kind: "unknown-method", code: METHOD_NOT_FOUND });

const listed = (capability: Capability): string[] =>
  Object.entries(TOOLS)
    .filter(([, { requires }]) => requires.every((feature) => hasFeature(capability, feature)))
    .map(([tool]) => tool);

/** A Store over the given ports. All it keeps is in `ports.storage`. */
export const createStore = (ports: Ports, config: StoreConfig): Store => {
  const { opRetentionSeconds, commitRetentionSeconds } = config.capability.limits;
  if (commitRetentionSeconds < opRetentionSeconds) {
    throw new RangeError("commitRetentionSeconds must be at least opRetentionSeconds.");
  }
  const capability = { version: PROTOCOL_VERSION, ...config.capability };
  const deps = { ...ports, capability, baseUrl: config.baseUrl };
  return {
    capability,
    tools: listed(capability),
    call: ({ tool, input, principal }) =>
      isReadyTool(tool) ? OPERATIONS[tool].answer({ deps, method: tool, input, principal }) : unknownMethod(),
    host: ({ operation, input, principal }) =>
      isReadyHostOperation(operation)
        ? OPERATIONS[operation].answer({ deps, method: operation, input, principal })
        : unknownMethod(),
  };
};
