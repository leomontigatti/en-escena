// The `code` oxlint JS plugin: the rules of docs/agents/coding-standards.md
// that a machine can judge. `.oxlintrc.json` decides which files it runs on.
//
// - `catch-reason`: "A `catch` rethrows what it does not expect, or logs
//   before converting". A catch that drops what it caught, with no binding or
//   a binding it never reads, either throws or carries a one-line reason, in
//   its body or right above its `try`.

const FUNCTIONS = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
]);

function childNodes(node) {
  return Object.entries(node).flatMap(([key, value]) => {
    if (key === "parent") return [];
    const values = Array.isArray(value) ? value : [value];
    return values.filter((item) => typeof item?.type === "string");
  });
}

// Whether a node holds a `throw` of its own: one inside a nested function
// throws for that function, not for the catch.
function containsThrow(node) {
  if (node.type === "ThrowStatement") return true;
  if (FUNCTIONS.has(node.type)) return false;
  return childNodes(node).some(containsThrow);
}

// The names a catch binds: `error`, or each one a pattern destructures.
function boundNames(pattern) {
  if (!pattern) return [];
  switch (pattern.type) {
    case "Identifier":
      return [pattern.name];
    case "ObjectPattern":
      return pattern.properties.flatMap((property) =>
        boundNames(property.type === "RestElement" ? property : property.value),
      );
    case "ArrayPattern":
      return pattern.elements.flatMap(boundNames);
    case "RestElement":
      return boundNames(pattern.argument);
    case "AssignmentPattern":
      return boundNames(pattern.left);
    default:
      return [];
  }
}

// A name used as a value, not a property's key or a member's property.
function isReference(node, parent) {
  if (parent?.type === "MemberExpression") {
    return parent.computed || parent.object === node;
  }
  if (parent?.type === "Property" && parent.key === node) {
    return parent.computed || parent.shorthand;
  }
  return true;
}

function referencesAny(node, names, parent) {
  if (node.type === "Identifier" && names.has(node.name)) {
    if (isReference(node, parent)) return true;
  }
  return childNodes(node).some((child) => referencesAny(child, names, node));
}

function readsBinding(clause) {
  const names = new Set(boundNames(clause.param));
  return names.size > 0 && referencesAny(clause.body, names, clause);
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
        if (readsBinding(node)) return;
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
