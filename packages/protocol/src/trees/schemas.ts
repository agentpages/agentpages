import * as v from "valibot";
import { TREE_INDEX_PATTERN } from "../common/patterns.js";
import { matching, type Schema } from "../common/schemas.js";
import type { TreeNode } from "./types.js";

export const TreeNodeSchema: Schema<TreeNode> = v.looseObject({
  parent: v.nullable(v.string()),
  index: matching(TREE_INDEX_PATTERN),
});
