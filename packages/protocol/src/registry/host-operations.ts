import type { HostOperations } from "../host-operations/operations.js";
import type { Mutates } from "./methods.js";

export type HostOperationName = keyof HostOperations;

export interface HostOperationInfo<O extends HostOperationName> {
  readonly mutates: Mutates<HostOperations[O]["params"]>;
}

/** The operations of section 5.6. A Store offers them to its host and never lists them as tools. */
export const HOST_OPERATIONS: { readonly [O in HostOperationName]: HostOperationInfo<O> } = {
  pages_open: { mutates: false },
  comments_start: { mutates: true },
};
