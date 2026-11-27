export const PROTOCOL_VERSION = "0.1";

export const EXTENSION_ID = "io.github.agentpages/agentpages";

export const METHOD_PREFIX = "agentpages/";

export const FEATURES = ["state", "identity", "files", "render"] as const;

export type Feature = (typeof FEATURES)[number];

export const isFeature = (value: string): value is Feature => FEATURES.some((feature) => feature === value);
