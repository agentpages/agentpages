export interface Ids {
  /** A new id, as section 2.1 of the spec defines one. */
  id(): string;
  /** The part of a page's `url` that nobody can guess. It needs no escaping in a URL. */
  secret(): string;
}
