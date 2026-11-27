import type { Rule } from "eslint";

interface Comment {
  type: string;
  value: string;
}

const isApiDoc = (comment: Comment): boolean =>
  comment.type === "Block" && comment.value.startsWith("*");

const citesExternalSource = (comment: Comment): boolean => /https?:\/\//.test(comment.value);

const isAllowed = (comment: Comment): boolean => isApiDoc(comment) || citesExternalSource(comment);

export const noComments: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: {
      unexpected:
        "Remove this comment and rename, extract or type the code instead. Only API docs (/** */) and links to an external constraint are allowed.",
    },
  },
  create: (context) => ({
    Program: () => {
      context.sourceCode
        .getAllComments()
        .filter((comment) => !isAllowed(comment))
        .flatMap((comment) => (comment.loc ? [comment.loc] : []))
        .forEach((loc) => {
          context.report({ loc, messageId: "unexpected" });
        });
    },
  }),
};
