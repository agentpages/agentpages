import {
  type Answer,
  type Capability,
  EXTENSION_ID,
  type HostCapability,
  type Implementation,
  type InitializeResult,
  MCP_APPS_VERSION,
  methodNotFound,
  type PeerHandlers,
  PING,
  PROTOCOL_VERSION,
  type Served,
  toJsonRpcError,
  UI_INITIALIZE,
} from "@agentpages/protocol";
import type { HostPorts, Serving } from "../types.js";

const HOST_INFO: Implementation = { name: "@agentpages/host", version: PROTOCOL_VERSION };

const advertised = ({ version, limits, state, identity, files }: Capability): HostCapability => ({
  version,
  limits,
  ...(state && { state }),
  ...(identity && { identity }),
  ...(files && { files }),
});

const initialized = (capability: Capability): InitializeResult => ({
  protocolVersion: MCP_APPS_VERSION,
  hostInfo: HOST_INFO,
  hostCapabilities: { experimental: { [EXTENSION_ID]: advertised(capability) } },
  hostContext: {},
});

const servedOf = (answer: Answer): Served => {
  if (answer.kind === "result") return { result: answer.result };
  return { error: answer.kind === "failure" ? toJsonRpcError(answer.failure) : methodNotFound() };
};

/**
 * Answers what a view asks: `ui/initialize` and `ping` here, everything else by the Store, asked once under a
 * `requestId` the host chose (REL-11, REL-25).
 */
export const answering =
  ({ capability, link, url }: Serving, { id }: HostPorts): PeerHandlers["request"] =>
  async ({ method, params }) => {
    if (method === UI_INITIALIZE) return { result: initialized(capability) };
    if (method === PING) return { result: {} };
    return servedOf(await link.view({ method, params, url, requestId: id() }));
  };
