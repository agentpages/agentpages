import * as v from "valibot";
import { EmptySchema } from "../common/schemas.js";
import { sealed } from "../common/seal.js";
import type { Schema } from "../common/validate.js";
import { EXTENSION_ID } from "../extension/constants.js";
import { HostCapabilitySchema } from "../extension/schemas.js";
import type { InitializeResult } from "./types.js";

const ImplementationSchema = v.object({ name: v.string(), version: v.string() });

/** The `ui/initialize` result of a host that advertises agentpages, without the fields this protocol does not read. */
export const InitializeResultSchema: Schema<InitializeResult> = sealed(
  v.object({
    protocolVersion: v.string(),
    hostInfo: ImplementationSchema,
    hostCapabilities: v.object({ experimental: v.object({ [EXTENSION_ID]: HostCapabilitySchema }) }),
    hostContext: EmptySchema,
  }),
);
