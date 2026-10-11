// The `docs-tests` oxlint JS plugin, run by `pnpm check:docs-tests` with its
// own config (`.oxlintrc.docs-tests.json`), not by `pnpm lint`.
//
// - `no-fixed-text`: a test asserts that a markdown document contains (or no
//   longer contains) a fixed piece of text. Such a test breaks on every
//   rewording and catches no bug: the doc is the only place the text lives, so
//   the assertion restates the doc (#1571).
//
// What stays allowed is a doc check with a source of truth outside the doc:
// links resolve, an index matches the files it lists, a value in the doc
// matches the module that enforces it. Those assert against something computed
// (`toContain(\`**${policy.bucket}**\`)`, a loop over the JSON map) or against
// a format (`/^\*\*Status\*\*: superseded by ADR-\d{4}$/m`), so the rule only
// fires when the expected text is a literal string, a regex that matches one
// literal string, or a name bound to them: a `for...of` item, a `forEach` or
// `test.each` callback parameter.
//
// A "doc" is any value read by a `read*` call (`readFile`, `readFileSync`,
// `readRepositoryFile`) whose argument names a `.md` path, directly, through a
// variable, a `path.*` call, `new URL(...)` or a loop over paths. Text derived
// from it by a method call or an index (`doc.slice(...)`, `lines[0]`) is still
// the doc. An item of a loop over the doc's parts is not: checking each
// glossary heading against a format is a structural check.

const TEXT_MATCHERS = new Set([
  "toBe",
  "toContain",
  "toEqual",
  "toMatch",
  "toStrictEqual",
]);
const SNAPSHOT_MATCHERS = new Set(["toMatchInlineSnapshot", "toMatchSnapshot"]);
const SEARCH_METHODS = new Set([
  "endsWith",
  "includes",
  "indexOf",
  "startsWith",
]);
// A path, not a glob: `staticPrefixOf("*.md")` reads no document.
const MARKDOWN_PATH = /^[^*?]*\.md$/;

const MESSAGE =
  "This asserts that a doc contains fixed text: it breaks on every rewording and catches no bug. Check structure against a source of truth outside the doc (a link resolves, an index matches its files, a value matches the code that enforces it), or delete the assertion.";

// Each function below takes the file's `sourceCode` first, to resolve names
// through its scopes, and a `seen` set last, so a name bound in a cycle ends.

const WRAPPERS = new Set([
  "AwaitExpression",
  "ChainExpression",
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
]);

// The parts of an expression a `.md` path can hide in: `[...paths]`,
// `dir + "/x.md"`, `path.resolve("docs/x.md")`, `new URL("./x.md", base)`.
// Any other call's result is not a path: `brokenLinks(doc)` returns findings.
const PATH_PARTS = {
  ArrayExpression: (node) => node.elements,
  BinaryExpression: (node) => [node.right],
  CallExpression: (node) =>
    node.callee.object?.name === "path" ? node.arguments : [],
  NewExpression: (node) => (node.callee.name === "URL" ? node.arguments : []),
  SpreadElement: (node) => [node.argument],
};

// Array methods and `test.each`, whose callback's first parameter is an item.
const ITERATING_METHODS = new Set([
  "every",
  "filter",
  "flatMap",
  "forEach",
  "map",
  "some",
]);

// A regex that can match more than one string: a class, group, quantifier,
// alternation, wildcard or class escape is left once escaped literals go.
const REGEX_SYNTAX = /[[\](){}*+?|.\\]/;

function unwrap(node) {
  let current = node;
  while (current && WRAPPERS.has(current.type)) {
    current = current.expression ?? current.argument;
  }
  return current;
}

function propertyName(member) {
  if (member?.type !== "MemberExpression" || member.computed) return undefined;
  return member.property.name;
}

function isStringLiteral(node) {
  return node?.type === "Literal" && typeof node.value === "string";
}

function isLiteralPattern(pattern) {
  return !REGEX_SYNTAX.test(pattern.replace(/\\[^dDwWsSbBpPu0-9]/g, ""));
}

function isLiteralText(node) {
  if (node.type === "TemplateLiteral") return node.expressions.length === 0;
  if (node.regex) return isLiteralPattern(node.regex.pattern);
  return isStringLiteral(node);
}

function calleeName(call) {
  return call.callee.type === "Identifier"
    ? call.callee.name
    : propertyName(call.callee);
}

function lastLiteralText(node) {
  if (node.type === "TemplateLiteral") return node.quasis.at(-1)?.value.cooked;
  return isStringLiteral(node) ? node.value : undefined;
}

// Unwraps `node` and marks it visited; undefined when there is nothing left
// to look at.
function visit(node, seen) {
  const current = unwrap(node);
  if (!current || seen.has(current)) return undefined;
  seen.add(current);
  return current;
}

function resolveVariable(sourceCode, identifier) {
  let scope = sourceCode.getScope(identifier);
  while (scope) {
    const variable = scope.set.get(identifier.name);
    if (variable) return variable;
    scope = scope.upper;
  }
  return undefined;
}

// The iterable when the declarator is the binding of a `for...of` loop.
function loopIterable(declarator) {
  const declaration = declarator.parent;
  const loop = declaration?.parent;
  return loop?.type === "ForOfStatement" && loop.left === declaration
    ? loop.right
    : undefined;
}

// `const [a, b] = await Promise.all([readA, readB])`: the element bound to `name`.
function promiseAllElement(declarator, name) {
  const init = unwrap(declarator.init);
  if (init?.type !== "CallExpression" || propertyName(init.callee) !== "all") {
    return undefined;
  }
  const list = unwrap(init.arguments[0]);
  const index = declarator.id.elements.findIndex(
    (element) => element?.type === "Identifier" && element.name === name,
  );
  return list?.type === "ArrayExpression" ? list.elements[index] : undefined;
}

// `items.forEach((item) => ...)` and `test.each(items)("%s", (item) => ...)`:
// the iterable whose items the callback's first parameter receives.
function callbackIterable(definition) {
  const callback = definition.node;
  const call = callback.parent;
  if (callback.params[0] !== definition.name) return undefined;
  if (call?.type !== "CallExpression" || !call.arguments.includes(callback)) {
    return undefined;
  }
  if (ITERATING_METHODS.has(propertyName(call.callee))) {
    return call.callee.object;
  }
  const { callee } = call;
  return callee.type === "CallExpression" &&
    propertyName(callee.callee) === "each"
    ? callee.arguments[0]
    : undefined;
}

// Where a variable gets its value: a loop item of an iterable, or a value.
function bindingOf(sourceCode, identifier) {
  const definition = resolveVariable(sourceCode, identifier)?.defs[0];
  if (definition?.type === "Parameter") {
    const iterable = callbackIterable(definition);
    return iterable ? { kind: "loopItem", node: iterable } : undefined;
  }
  if (definition?.type !== "Variable") return undefined;

  const declarator = definition.node;
  const iterable = loopIterable(declarator);
  if (iterable) return { kind: "loopItem", node: iterable };

  const value =
    declarator.id.type === "ArrayPattern"
      ? promiseAllElement(declarator, identifier.name)
      : declarator.init;
  return value ? { kind: "value", node: value } : undefined;
}

function namesMarkdownPath(sourceCode, node, seen) {
  const current = visit(node, seen);
  if (!current) return false;

  if (current.type === "Identifier") {
    const binding = bindingOf(sourceCode, current);
    return (
      Boolean(binding) && namesMarkdownPath(sourceCode, binding.node, seen)
    );
  }

  const parts = PATH_PARTS[current.type];
  if (parts) {
    return parts(current).some((part) =>
      namesMarkdownPath(sourceCode, part, seen),
    );
  }

  return MARKDOWN_PATH.test(lastLiteralText(current) ?? "");
}

function isDocText(sourceCode, node, seen) {
  const current = visit(node, seen);
  const docTextOf = DOC_TEXT[current?.type];
  return Boolean(docTextOf) && docTextOf(sourceCode, current, seen);
}

// What makes each kind of expression the doc's text: a name bound to it, an
// index into it, a method called on it, or a `read*` call given a `.md` path.
const DOC_TEXT = {
  Identifier(sourceCode, identifier, seen) {
    const binding = bindingOf(sourceCode, identifier);
    return (
      binding?.kind === "value" && isDocText(sourceCode, binding.node, seen)
    );
  },
  MemberExpression(sourceCode, member, seen) {
    return member.computed && isDocText(sourceCode, member.object, seen);
  },
  CallExpression(sourceCode, call, seen) {
    if (
      call.callee.type === "MemberExpression" &&
      isDocText(sourceCode, call.callee.object, seen)
    ) {
      return true;
    }
    return (
      /read/i.test(calleeName(call) ?? "") &&
      call.arguments.some((argument) =>
        namesMarkdownPath(sourceCode, argument, new Set()),
      )
    );
  },
};

function isFixedText(sourceCode, node, seen) {
  const current = visit(node, seen);
  if (!current) return false;

  if (current.type === "Identifier") {
    const binding = bindingOf(sourceCode, current);
    if (!binding) return false;
    return binding.kind === "loopItem"
      ? isFixedList(sourceCode, binding.node, seen)
      : isFixedText(sourceCode, binding.node, seen);
  }

  if (current.type === "BinaryExpression") {
    return (
      isFixedText(sourceCode, current.left, seen) &&
      isFixedText(sourceCode, current.right, seen)
    );
  }

  if (current.type === "ArrayExpression") {
    return hasFixedElements(sourceCode, current, seen);
  }

  return isLiteralText(current);
}

function isFixedList(sourceCode, node, seen) {
  const current = visit(node, seen);

  if (current?.type === "Identifier") {
    const binding = bindingOf(sourceCode, current);
    return (
      binding?.kind === "value" && isFixedList(sourceCode, binding.node, seen)
    );
  }

  return (
    current?.type === "ArrayExpression" &&
    hasFixedElements(sourceCode, current, seen)
  );
}

// `test.each` takes rows as well as items: `[["a"], ["b"]]` is fixed too.
function hasFixedElements(sourceCode, array, seen) {
  return (
    array.elements.length > 0 &&
    array.elements.every((element) =>
      element?.type === "SpreadElement"
        ? isFixedList(sourceCode, element.argument, seen)
        : isFixedText(sourceCode, element, seen),
    )
  );
}

// `expect(subject)`, `expect(subject).not`, `expect.soft(subject).resolves`.
function expectSubject(matcherObject) {
  let current = matcherObject;
  while (current?.type === "MemberExpression") current = current.object;
  if (current?.type !== "CallExpression") return undefined;

  const { callee } = current;
  const base = callee.type === "MemberExpression" ? callee.object : callee;
  return base.type === "Identifier" && base.name === "expect"
    ? current.arguments[0]
    : undefined;
}

// `expect(doc.includes("..."))` and `expect(/.../.test(doc))`: the same
// assertion spelled as a boolean.
function isFixedSearch(sourceCode, subject) {
  const current = unwrap(subject);
  if (current?.type !== "CallExpression") return false;

  const method = propertyName(current.callee);
  const [argument] = current.arguments;

  if (SEARCH_METHODS.has(method)) {
    return (
      isDocText(sourceCode, current.callee.object, new Set()) &&
      isFixedText(sourceCode, argument, new Set())
    );
  }

  return (
    method === "test" &&
    Boolean(unwrap(current.callee.object)?.regex) &&
    isDocText(sourceCode, argument, new Set())
  );
}

function assertsFixedDocText(sourceCode, matcherCall) {
  const matcher = propertyName(matcherCall.callee);
  if (!matcher?.startsWith("to")) return false;

  const subject = expectSubject(matcherCall.callee.object);
  if (!subject) return false;
  if (isFixedSearch(sourceCode, subject)) return true;
  if (!isDocText(sourceCode, subject, new Set())) return false;

  return (
    SNAPSHOT_MATCHERS.has(matcher) ||
    (TEXT_MATCHERS.has(matcher) &&
      isFixedText(sourceCode, matcherCall.arguments[0], new Set()))
  );
}

export default {
  meta: { name: "docs-tests" },
  rules: {
    "no-fixed-text": {
      create(context) {
        return {
          CallExpression(node) {
            if (assertsFixedDocText(context.sourceCode, node)) {
              context.report({ node, message: MESSAGE });
            }
          },
        };
      },
    },
  },
};
