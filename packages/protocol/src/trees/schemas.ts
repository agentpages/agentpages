import * as v from "valibot";
import { TREE_INDEX_PATTERN } from "../common/patterns.js";
import { IdSchema, JsonObjectSchema, type Raw, valueProblems } from "../common/schemas.js";
import { sealed } from "../common/seal.js";
import type { Schema } from "../common/validate.js";
import type { TreeNode } from "./types.js";

const ParentSchema: Raw<string | null> = v.nullable(IdSchema);

const IndexSchema: Raw<string> = v.pipe(v.string(), v.regex(TREE_INDEX_PATTERN));

/** The `data` of a tree document: its position is checked, every other field is passed on as it came. */
export const TreeNodeSchema: Schema<TreeNode> = sealed(
  v.pipe(
    JsonObjectSchema,
    v.rawTransform(({ dataset, addIssue, NEVER }) => {
      const { parent, index } = dataset.value;
      const problems = [
        ...valueProblems({ name: "parent", item: parent }, ParentSchema),
        ...valueProblems({ name: "index", item: index }, IndexSchema),
      ];
      problems.forEach((problem) => {
        addIssue(problem);
      });
      return problems.length > 0
        ? NEVER
        : { ...dataset.value, parent: v.parse(ParentSchema, parent), index: v.parse(IndexSchema, index) };
    }),
  ),
);
