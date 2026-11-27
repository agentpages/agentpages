import type { Principal } from "../access/principal.js";
import type { Tx } from "../ports/storage.js";
import { handle } from "./handle.js";
import type { Context, Handler, Schemas, Spec } from "./operation.js";
import { type Outcome, refuse } from "./outcome.js";

/** The last two steps of a request: its limits, then what it does. */
export const settle =
  <P, T, R, Who extends Principal>(spec: Spec<P, T, R, Who>) =>
  (context: Context<P, T, Who>, tx: Tx): Promise<Outcome<R>> => {
    const beyond = spec.limits?.(context.params, context.deps.capability);
    return beyond === undefined ? spec.run(context, tx) : Promise.resolve(refuse(beyond));
  };

/** An operation that changes nothing. */
export const query = <P, T, R, Who extends Principal = Principal>(
  schemas: Schemas<P, R>,
  spec: Spec<P, T, R, Who>,
): Handler<P, R, Who> => ({
  schemas,
  answer: (call) =>
    handle(
      {
        schemas,
        spec,
        inside: (place) => async (request, tx) => {
          const found = await place.find(request, tx);
          return found.ok ? settle(spec)({ ...request, target: found.value }, tx) : found;
        },
      },
      call,
    ),
});
