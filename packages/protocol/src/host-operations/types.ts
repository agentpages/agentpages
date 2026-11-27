import type { PageInfo } from "../pages/types.js";
import type { TypeContent, TypeInfo } from "../types/types.js";

/** What a host needs to show a page: the page, what to render, and the type of a typed page. */
export interface Opened {
  page: PageInfo;
  view: TypeContent;
  type?: TypeInfo;
}
