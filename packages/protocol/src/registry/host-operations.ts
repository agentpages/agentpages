import type { HostOperations } from "../host-operations/operations.js";
import type { Mutates } from "./methods.js";

export type HostOperationName = keyof HostOperations;

export interface HostOperationInfo<O extends HostOperationName> {
  readonly mutates: Mutates<HostOperations[O]["params"]>;
}

/** The operations of section 5.6. A Store offers them to its host, and lists none of them as a tool in this form. */
export const HOST_OPERATIONS: { readonly [O in HostOperationName]: HostOperationInfo<O> } = {
  pages_open: { mutates: false },
  comments_start: { mutates: true },
  pages_heads: { mutates: false },
  comments_list: { mutates: false },
  comments_reply: { mutates: true },
  comments_resolve: { mutates: true },
};
