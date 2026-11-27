import type { Viewer } from "../identity/types.js";

export interface Thread {
  id: string;
  pageId: string;
  version: number;
  quote?: string;
  status: "open" | "resolved";
  entries: Entry[];
}

export interface Entry {
  id: string;
  author: Viewer | null;
  body: string;
  createdAt: string;
}
