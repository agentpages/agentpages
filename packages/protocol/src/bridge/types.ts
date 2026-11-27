import type { Empty } from "../common/types.js";
import type { EXTENSION_ID } from "../extension/constants.js";
import type { Capability } from "../extension/types.js";

/** What a host advertises: the capability of its Store without `render`. */
export type HostCapability = Omit<Capability, "render">;

export interface Implementation {
  name: string;
  version: string;
}

/** The params of `ui/initialize`, which a view sends. */
export interface InitializeParams {
  appInfo: Implementation;
  appCapabilities: Empty;
  protocolVersion: string;
}

/** The result of `ui/initialize`, as much of it as this protocol reads. */
export interface InitializeResult {
  protocolVersion: string;
  hostInfo: Implementation;
  hostCapabilities: { experimental: Record<typeof EXTENSION_ID, HostCapability> };
  hostContext: Empty;
}

/** The params of `ui/resource-teardown`, which a host sends. */
export interface TeardownParams {
  reason: string;
}
