// The `code` oxlint JS plugin: the rules of docs/agents/coding-standards.md
// that a machine can judge. `.oxlintrc.json` decides which files it runs on.
//
// - `catch-reason`: "A `catch` rethrows what it does not expect, or logs
//   before converting". A catch that drops what it caught, with no binding or
//   a binding it never reads, either throws or carries a one-line reason, in
//   its body or right above its `try`.

// Whether a node holds a `throw` of its own: one inside a nested function
// throws for that function, not for the catch.
function containsThrow(node) {
  if (!node || typeof node.type !== "string") return false;
  if (node.type === "ThrowStatement") return true;
  if (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  ) {
    return false;
  }
  return Object.entries(node).some(([key, value]) => {
    if (key === "parent") return false;
    if (Array.isArray(value)) return value.some(containsThrow);
    return typeof value?.type === "string" && containsThrow(value);
  });
}

function readsBinding(sourceCode, clause) {
  if (clause.param?.type !== "Identifier") return false;
  const name = clause.param.name;
  return new RegExp(`(?<![\\w$])${name}(?![\\w$])`).test(
    sourceCode.getText(clause.body),
  );
}

// A comment on the line or lines right above the `try`.
function hasReasonAbove(sourceCode, tryStatement) {
  const comment = sourceCode.getCommentsBefore(tryStatement).at(-1);
  return (
    comment !== undefined &&
    comment.loc.end.line >= tryStatement.loc.start.line - 1
  );
}

const catchReason = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "A catch that drops what it caught throws or says why in a comment.",
    },
    messages: {
      reason:
        "This catch drops what it caught: rethrow what it does not expect, log it with a tag before turning it into user copy, or give the one-line reason it is safe to drop, inside the catch or right above the `try`. A dropped error makes an infrastructure failure read as user error, with no trace (coding standards, A `catch` rethrows what it does not expect).",
    },
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode;

    return {
      CatchClause(node) {
        if (readsBinding(sourceCode, node)) return;
        if (containsThrow(node.body)) return;
        if (sourceCode.getCommentsInside(node.body).length > 0) return;
        if (hasReasonAbove(sourceCode, node.parent)) return;
        context.report({ node, messageId: "reason" });
      },
    };
  },
};

export default {
  meta: { name: "code" },
  rules: {
    "catch-reason": catchReason,
  },
};
