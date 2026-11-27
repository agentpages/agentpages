import type { Actor } from "../state/types.js";

export interface FileInfo {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  updatedAt: string;
  updatedBy: Actor;
}
