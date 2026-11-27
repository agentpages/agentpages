import { NEED } from "../access/permits.js";
import type { Principal } from "../access/principal.js";
import { rememberedBy } from "../pages/keys.js";
import type { Page } from "../pages/records.js";
import type { Handler, Remembered, Target } from "../pipeline/index.js";
import type { Arrival } from "../state/scope.js";

/** A files operation, declared once for however its request arrives: as a tool, or as a method of a view. */
export type Filed<Params, R> = <P extends Params>(arrival: Arrival<P, R>) => Handler<P, R, Principal>;

/** What reading the files of a page needs of it. */
export const toRead = <P, R>({ page }: Arrival<P, R>): { target: Target<P, Page> } => ({ target: page(NEED.read) });

/** What changing the files of a page needs of it, and where the page keeps the requests it remembers. */
export const toChange = <P, R>({ page }: Arrival<P, R>): { target: Target<P, Page>; remembers: (params: P, page: Page) => Remembered } => ({
  target: page(NEED.write),
  remembers: (_, { info }) => rememberedBy(info.pageId),
});
