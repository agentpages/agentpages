export interface TreeNode {
  parent: string | null;
  index: string;
  [field: string]: unknown;
}
