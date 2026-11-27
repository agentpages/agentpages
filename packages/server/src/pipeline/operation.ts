import type { Answer, Capability, Problem, Schema } from "@agentpages/protocol";
import type { Principal } from "../access/principal.js";
import type { Ports } from "../ports/ports.js";
import type { Key, Tx } from "@agentpages/storage";
import type { Outcome } from "./outcome.js";

export interface Deps extends Ports {
  readonly capability: Capability;
  /** A page's `url` is this, its `pageId`, a slash and its secret. */
  readonly baseUrl: string;
}

/** A request as it arrives. */
export interface Call<Who extends Principal> {
  deps: Deps;
  method: string;
  input: unknown;
  principal: Who;
  /** The id the request goes by: its host chose it for a host operation, and the Store for a tool call. */
  requestId: string;
}

/** A well-formed request. */
export interface Request<P, Who extends Principal = Principal> {
  deps: Deps;
  method: string;
  params: P;
  principal: Who;
  requestId: string;
  /** When the request arrived, as a timestamp. */
  at: string;
}

/** A request with the page or type it names, which the caller may use as the operation needs. */
export interface Context<P, T, Who extends Principal = Principal> extends Request<P, Who> {
  target: T;
}

/** What a log record says a request was about. */
interface Names {
  opId?: string;
  pageId?: string;
}

/** Where a request points. */
export interface Place<P, T, Who extends Principal> {
  names: Names;
  /** One lock per page or type. */
  locks: Key[];
  /** The target, once it exists and the caller has access. */
  find(request: Request<P, Who>, tx: Tx): Promise<Outcome<T>>;
}

/** The page or type a request names. Nothing when its params name none that could exist. */
export type Target<P, T, Who extends Principal = Principal> = (params: P, deps: Deps) => Place<P, T, Who> | undefined;

export interface Spec<P, T, R, Who extends Principal> {
  target: Target<P, T, Who>;
  /** What makes well-formed params malformed all the same. */
  malformed?: (params: P, deps: Deps) => Problem | undefined;
  /** The limit the request breaks. */
  limits?: (params: P, capability: Capability) => Problem | undefined;
  run: (context: Context<P, T, Who>, tx: Tx) => Promise<Outcome<R>>;
}

export interface Schemas<P, R> {
  readonly params: Schema<P>;
  readonly result: Schema<R>;
}

/** One operation of the Store, ready to answer requests. */
export interface Handler<P, R, Who extends Principal> {
  readonly schemas: Schemas<P, R>;
  readonly answer: (call: Call<Who>) => Promise<Answer>;
}
