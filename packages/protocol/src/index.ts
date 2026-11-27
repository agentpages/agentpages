export const PROTOCOL_VERSION = "0.1.0";

export const CAPABILITIES = ["storage", "identity", "model", "files"] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const isCapability = (value: string): value is Capability =>
  CAPABILITIES.some((capability) => capability === value);
