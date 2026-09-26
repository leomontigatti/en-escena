// The `ui` oxlint JS plugin: the two clauses of docs/agents/style-guide.md that a
// machine can judge. `.oxlintrc.json` decides which files it runs on.
import path from "node:path";

const RAW_FORM_ELEMENTS = new Set(["button", "select", "textarea", "input"]);
const CLASS_HELPERS = new Set(["cn", "clsx"]);
const UI_ALIAS_PREFIX = "@/components/ui/";
const UI_DIRECTORY_SEGMENT = `${path.sep}app${path.sep}components${path.sep}ui${path.sep}`;

function stringAttribute(openingElement, name) {
  const attribute = openingElement.attributes.find(
    (item) => item.type === "JSXAttribute" && item.name.name === name,
  );
  if (!attribute || !attribute.value) return undefined;
  if (attribute.value.type === "Literal") return attribute.value.value;
  const expression = attribute.value.expression;
  if (expression?.type === "Literal" && typeof expression.value === "string") {
    return expression.value;
  }
  return undefined;
}

// `<DropdownMenuItem asChild><button …/></DropdownMenuItem>`: the parent renders
// the element through its Slot and owns its look, so the raw element is right.
function isSlotChild(openingElement) {
  const parent = openingElement.parent?.parent;
  if (parent?.type !== "JSXElement") return false;
  return parent.openingElement.attributes.some(
    (item) =>
      item.type === "JSXAttribute" &&
      item.name.name === "asChild" &&
      !(
        item.value?.type === "JSXExpressionContainer" &&
        item.value.expression.type === "Literal" &&
        item.value.expression.value === false
      ),
  );
}

// `<input type="file" className="sr-only">` under a styled `<label>`: the
// element is only the picker behind a drop zone, so it has no look to drift.
function isVisuallyHidden(openingElement) {
  const attribute = openingElement.attributes.find(
    (item) => item.type === "JSXAttribute" && item.name.name === "className",
  );
  return classTokens(attribute?.value).includes("sr-only");
}

// The comprobante's printable view renders a whole `<html>` document with its
// own CSS and without the app's stylesheet, so a ui component there is unstyled.
function isInStandaloneDocument(openingElement) {
  for (let node = openingElement.parent; node; node = node.parent) {
    if (
      node.type === "JSXElement" &&
      node.openingElement.name.type === "JSXIdentifier" &&
      node.openingElement.name.name === "html"
    ) {
      return true;
    }
  }
  return false;
}

function inputReplacement(type) {
  if (type === "checkbox") return "Checkbox, or Switch for an on/off setting";
  if (type === "submit" || type === "button" || type === "reset") {
    return "Button";
  }
  return "Input";
}

const noRawFormElement = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Use the components under app/components/ui instead of raw form elements.",
    },
    messages: {
      raw: "Use {{replacement}} from app/components/ui instead of a raw <{{element}}>: that component owns the look, so a raw element drifts from it.",
    },
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.type !== "JSXIdentifier") return;
        const element = node.name.name;
        if (
          !RAW_FORM_ELEMENTS.has(element) ||
          isSlotChild(node) ||
          isVisuallyHidden(node) ||
          isInStandaloneDocument(node)
        ) {
          return;
        }

        let replacement;
        if (element === "input") {
          const type = stringAttribute(node, "type");
          if (type === "hidden") return;
          replacement = inputReplacement(type);
        } else {
          replacement = {
            button: "Button",
            select: "Select",
            textarea: "Textarea",
          }[element];
        }

        context.report({
          node,
          messageId: "raw",
          data: { element, replacement },
        });
      },
    };
  },
};

// A class counts when, after its variants (`md:`), it sets a fixed height, a
// radius or a ring/outline, or when it sits under a focus variant at all: the
// component owns its whole focus state, not only the ring. `h-full`, `min-h-*`
// and `max-h-*` are layout: they size a box against its container.
const HEIGHT_CLASS = /^h-(\d|\[|px$)/;
const RADIUS_CLASS = /^rounded(-|$)/;
const RING_CLASS = /^(ring|outline)(-|$)/;
const FOCUS_VARIANTS = new Set(["focus", "focus-visible", "focus-within"]);

// A component that sets no height of its own: a height on it sizes the box, the
// way shadcn's data-table gives its empty row `h-24`.
const HEIGHTLESS_COMPONENTS = new Set(["TableCell"]);

function restyledClass(token, component) {
  const parts = token.split(":");
  const utility = parts.pop().replace(/^!/, "").replace(/!$/, "");
  if (parts.some((variant) => FOCUS_VARIANTS.has(variant))) return true;
  return (
    (HEIGHT_CLASS.test(utility) && !HEIGHTLESS_COMPONENTS.has(component)) ||
    RADIUS_CLASS.test(utility) ||
    RING_CLASS.test(utility)
  );
}

function staticClassStrings(expression) {
  if (!expression) return [];
  if (expression.type === "Literal") {
    return typeof expression.value === "string" ? [expression.value] : [];
  }
  if (expression.type === "TemplateLiteral") {
    return expression.quasis.map((quasi) => quasi.value.cooked ?? "");
  }
  if (
    expression.type === "CallExpression" &&
    expression.callee.type === "Identifier" &&
    CLASS_HELPERS.has(expression.callee.name)
  ) {
    return expression.arguments.flatMap((argument) =>
      argument.type === "Literal" || argument.type === "TemplateLiteral"
        ? staticClassStrings(argument)
        : [],
    );
  }
  return [];
}

function importsUiComponent(source, filename) {
  if (source.startsWith(UI_ALIAS_PREFIX)) return true;
  if (!source.startsWith(".")) return false;
  const resolved = path.resolve(path.dirname(filename), source);
  return `${resolved}${path.sep}`.includes(UI_DIRECTORY_SEGMENT);
}

function uiComponentName(name, uiNames, uiNamespaces) {
  if (name.type === "JSXIdentifier") {
    return uiNames.has(name.name) ? name.name : undefined;
  }
  const namespaced =
    name.type === "JSXMemberExpression" &&
    name.object.type === "JSXIdentifier" &&
    uiNamespaces.has(name.object.name);
  return namespaced ? `${name.object.name}.${name.property.name}` : undefined;
}

function classTokens(value) {
  if (!value) return [];
  const strings =
    value.type === "Literal"
      ? [value.value]
      : staticClassStrings(value.expression);
  return strings.join(" ").split(/\s+/).filter(Boolean);
}

function restyledClasses(value, component) {
  return classTokens(value).filter((token) => restyledClass(token, component));
}

const noRestyle = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Do not override the height, radius or focus ring of an app/components/ui component through className.",
    },
    messages: {
      restyle:
        "`{{className}}` restyles <{{component}}>: pick a `variant` or `size`, or add one to the component. Layout classes stay allowed.",
    },
    schema: [],
  },
  create(context) {
    const uiNames = new Set();
    const uiNamespaces = new Set();

    return {
      ImportDeclaration(node) {
        if (!importsUiComponent(node.source.value, context.filename)) return;
        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportNamespaceSpecifier") {
            uiNamespaces.add(specifier.local.name);
          } else {
            uiNames.add(specifier.local.name);
          }
        }
      },
      JSXOpeningElement(node) {
        const component = uiComponentName(node.name, uiNames, uiNamespaces);
        if (!component) return;
        const attribute = node.attributes.find(
          (item) =>
            item.type === "JSXAttribute" && item.name.name === "className",
        );
        const restyled = restyledClasses(attribute?.value, component);
        if (restyled.length === 0) return;
        context.report({
          node: attribute,
          messageId: "restyle",
          data: { className: restyled.join(" "), component },
        });
      },
    };
  },
};

export default {
  meta: { name: "ui" },
  rules: {
    "no-raw-form-element": noRawFormElement,
    "no-restyle": noRestyle,
  },
};
