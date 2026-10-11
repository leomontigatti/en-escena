// The `ui` oxlint JS plugin: the clauses of docs/agents/style-guide.md that a
// machine can judge. `.oxlintrc.json` decides which files it runs on.
//
// - `no-raw-form-element`: Components, a raw form element where a ui one exists.
// - `no-restyle`: Components, a class overriding a ui component's height,
//   radius or focus state.
// - `tabs-line-variant`: Navigation, `Tabs` take `variant="line"`.
// - `data-icon-position`: Buttons, an icon says which side of the label it is on.
// - `dialog-width`: Destructive actions, dialogs keep their default width.
// - `actions-menu-text-only`: Actions menu, no icon inside the JSX of a
//   `ResourceActionsMenu`. It reads one file: items a child component renders
//   are out of its sight.
// - `confirm-wording`: Destructive actions, a confirmation's title is a
//   question and its verb is the title's, never `Confirmar` or `Aceptar`.
// - `no-borrar`: Interface text, a delete says `eliminar`. It also reads the
//   `.ts` files, where refusals and server messages live.
// - `confirmation-shared`: Destructive actions, an `AlertDialog` is written
//   once in app/components/shared, never inline in a view.
// - `alert-structure`: Alerts, an `Alert` has a variant, that variant's one
//   icon, an `AlertTitle` and an `AlertDescription`.
// - `restricted-syntax`: single shapes the guide bans, each with its reason:
//   `toast.info`, a `dark:` class, an `<h1>` under the admin or the portal,
//   `FormEvent`, and a native `form.submit()`. oxlint has no
//   `no-restricted-syntax`, so this is that block.
//
// `Trash2` over `Trash` (Buttons) is the built-in `no-restricted-imports`, in
// `.oxlintrc.json`.
import path from "node:path";

const RAW_FORM_ELEMENTS = new Set(["button", "select", "textarea", "input"]);
const CLASS_HELPERS = new Set(["cn", "clsx"]);
const UI_ALIAS_PREFIX = "@/components/ui/";
const UI_DIRECTORY_SEGMENT = `${path.sep}app${path.sep}components${path.sep}ui${path.sep}`;

function findAttribute(openingElement, name) {
  return openingElement.attributes.find(
    (item) => item.type === "JSXAttribute" && item.name.name === name,
  );
}

function stringAttribute(openingElement, name) {
  const attribute = findAttribute(openingElement, name);
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
// A `not-sr-only` under any variant (`sm:`, `focus:`) shows it again.
function isVisuallyHidden(openingElement) {
  const attribute = openingElement.attributes.find(
    (item) => item.type === "JSXAttribute" && item.name.name === "className",
  );
  const tokens = classTokens(attribute?.value);
  return (
    tokens.includes("sr-only") &&
    !tokens.some((token) => token.split(":").pop() === "not-sr-only")
  );
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

// The names a file imports from app/components/ui, so a rule about a ui
// component judges that component and not a local one that shares its name.
function trackUiImports(context) {
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
    componentName(name) {
      return uiComponentName(name, uiNames, uiNamespaces);
    },
  };
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
    const uiImports = trackUiImports(context);

    return {
      ImportDeclaration: uiImports.ImportDeclaration,
      JSXOpeningElement(node) {
        const component = uiImports.componentName(node.name);
        if (!component) return;
        const attribute = findAttribute(node, "className");
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

const tabsLineVariant = {
  meta: {
    type: "suggestion",
    docs: {
      description: 'Tabs take variant="line".',
    },
    messages: {
      variant:
        'Give <TabsList> variant="line": every tab bar uses the line variant (style guide, Navigation).',
    },
    schema: [],
  },
  create(context) {
    const uiImports = trackUiImports(context);

    return {
      ImportDeclaration: uiImports.ImportDeclaration,
      JSXOpeningElement(node) {
        if (uiImports.componentName(node.name) !== "TabsList") return;
        if (stringAttribute(node, "variant") === "line") return;
        context.report({ node, messageId: "variant" });
      },
    };
  },
};

const ICON_POSITIONS = new Set(["inline-start", "inline-end"]);

// A value the rule cannot read (a conditional, a prop) is left alone, the way
// `no-restyle` leaves a dynamic class.
function hasUnreadableValue(attribute) {
  return (
    attribute.value?.type === "JSXExpressionContainer" &&
    attribute.value.expression.type !== "Literal"
  );
}

const dataIconPosition = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "A button icon's data-icon says which side of the label it is on.",
    },
    messages: {
      position:
        'Write `data-icon="inline-start"` or `data-icon="inline-end"`: Button only applies its icon padding for those two values, and an icon-only button takes no `data-icon` at all (style guide, Buttons).',
    },
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const attribute = findAttribute(node, "data-icon");
        if (!attribute || hasUnreadableValue(attribute)) return;
        if (ICON_POSITIONS.has(stringAttribute(node, "data-icon"))) return;
        context.report({ node: attribute, messageId: "position" });
      },
    };
  },
};

// The one width a dialog may set: an AlertDialog carrying a list, a preview or
// an alert widens to the Dialog width.
const WIDE_ALERT_DIALOG_CLASS = "sm:max-w-lg";

function widthClasses(value, component) {
  return classTokens(value).filter(
    (token) =>
      token.split(":").pop().replace(/^!/, "").startsWith("max-w-") &&
      !(
        component === "AlertDialogContent" && token === WIDE_ALERT_DIALOG_CLASS
      ),
  );
}

const dialogWidth = {
  meta: {
    type: "suggestion",
    docs: {
      description: "AlertDialog and Dialog keep their default width.",
    },
    messages: {
      size: "Drop `size` from <AlertDialogContent>: a confirmation keeps its default width (style guide, Destructive actions).",
      width:
        "`{{className}}` sets the width of <{{component}}>: a dialog keeps its default width, and only an AlertDialog carrying a list, a preview or an alert widens, with `sm:max-w-lg` (style guide, Destructive actions).",
    },
    schema: [],
  },
  create(context) {
    const uiImports = trackUiImports(context);

    return {
      ImportDeclaration: uiImports.ImportDeclaration,
      JSXOpeningElement(node) {
        const component = uiImports.componentName(node.name);
        if (
          component !== "AlertDialogContent" &&
          component !== "DialogContent"
        ) {
          return;
        }

        const size = findAttribute(node, "size");
        if (size && component === "AlertDialogContent") {
          context.report({ node: size, messageId: "size" });
        }

        const attribute = findAttribute(node, "className");
        const widths = widthClasses(attribute?.value, component);
        if (widths.length === 0) return;
        context.report({
          node: attribute,
          messageId: "width",
          data: { className: widths.join(" "), component },
        });
      },
    };
  },
};

const ICON_PACKAGE = "lucide-react";
const ACTIONS_MENU = "ResourceActionsMenu";

function isInActionsMenu(openingElement) {
  for (let node = openingElement.parent?.parent; node; node = node.parent) {
    if (
      node.type === "JSXElement" &&
      node.openingElement.name.type === "JSXIdentifier" &&
      node.openingElement.name.name === ACTIONS_MENU
    ) {
      return true;
    }
  }
  return false;
}

const actionsMenuTextOnly = {
  meta: {
    type: "suggestion",
    docs: {
      description: "The items of a ResourceActionsMenu carry no icon.",
    },
    messages: {
      icon: "Drop <{{icon}}> from the actions menu: its items are text only (style guide, Actions menu).",
    },
    schema: [],
  },
  create(context) {
    const icons = new Set();

    return {
      ImportDeclaration(node) {
        if (node.source.value !== ICON_PACKAGE) return;
        for (const specifier of node.specifiers) {
          icons.add(specifier.local.name);
        }
      },
      JSXOpeningElement(node) {
        if (node.name.type !== "JSXIdentifier") return;
        if (!icons.has(node.name.name) || !isInActionsMenu(node)) return;
        context.report({
          node,
          messageId: "icon",
          data: { icon: node.name.name },
        });
      },
    };
  },
};

// The static start of what an element shows: its leading text, or `undefined`
// when it starts with something the rule cannot read (a prop, a call).
function leadingText(element) {
  for (const child of element.children) {
    if (child.type === "JSXText") {
      if (child.value.trim() === "") continue;
      return child.value.trim();
    }
    if (child.type === "JSXExpressionContainer") {
      return staticString(child.expression);
    }
    return undefined;
  }
  return undefined;
}

// Every piece of static text an element shows, icons and props skipped.
function staticText(element) {
  return element.children
    .flatMap((child) => {
      if (child.type === "JSXText") return [child.value];
      if (child.type === "JSXExpressionContainer") {
        return [staticString(child.expression) ?? ""];
      }
      return [];
    })
    .join(" ")
    .trim();
}

function staticString(expression) {
  if (expression?.type === "Literal" && typeof expression.value === "string") {
    return expression.value;
  }
  if (expression?.type === "TemplateLiteral") {
    const start = expression.quasis[0]?.value.cooked ?? "";
    // A template that opens with an expression starts with what it reads.
    return start === "" && expression.expressions.length > 0
      ? undefined
      : start;
  }
  return undefined;
}

function attributeString(openingElement, name) {
  const attribute = findAttribute(openingElement, name);
  if (!attribute?.value) return undefined;
  if (attribute.value.type === "Literal") return attribute.value.value;
  return staticString(attribute.value.expression);
}

const GENERIC_VERB = /^(Confirmar|Aceptar)\b/;

function genericVerb(text) {
  return text?.replace(/^¿/, "").match(GENERIC_VERB)?.[1];
}

function isInside(openingElement, isAncestor) {
  for (let node = openingElement.parent?.parent; node; node = node.parent) {
    if (node.type === "JSXElement" && isAncestor(node.openingElement)) {
      return true;
    }
  }
  return false;
}

const confirmWording = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "A confirmation's title is a question and its verb repeats the title's.",
    },
    messages: {
      question:
        "Write a confirmation's title as a question naming the action and its object (`¿Eliminar la coreografía?`): it is what the buttons under it answer (style guide, Destructive actions).",
      verb: "Name the action with the verb from the title (`Eliminar`, `Guardar`, `Anular`), not `{{verb}}`: a generic verb sends the user back to the question to learn what the button does (style guide, Destructive actions).",
    },
    schema: [],
  },
  create(context) {
    const uiImports = trackUiImports(context);

    function checkTitle(node, text) {
      if (text === undefined) return;
      if (!text.startsWith("¿")) {
        context.report({ node, messageId: "question" });
      }
    }

    function checkVerb(node, text) {
      const verb = genericVerb(text);
      if (verb) context.report({ node, messageId: "verb", data: { verb } });
    }

    return {
      ImportDeclaration: uiImports.ImportDeclaration,
      JSXElement(node) {
        const opening = node.openingElement;
        const component = uiImports.componentName(opening.name);

        if (component === "AlertDialogTitle") {
          const text = leadingText(node);
          checkTitle(opening, text);
          checkVerb(opening, text);
          return;
        }

        if (
          component === "AlertDialogAction" ||
          (component === "Button" &&
            isInside(
              opening,
              (ancestor) =>
                uiImports.componentName(ancestor.name) === "AlertDialogFooter",
            ))
        ) {
          checkVerb(opening, staticText(node));
          return;
        }

        if (
          opening.name.type === "JSXIdentifier" &&
          opening.name.name === "ConfirmationDialog"
        ) {
          const title = attributeString(opening, "title");
          checkTitle(opening, title);
          checkVerb(opening, title);
          checkVerb(opening, attributeString(opening, "confirmLabel"));
        }
      },
    };
  },
};

// Every word built on `borr-` (`borrar`, `borró`, `Borrá`, `borralo`,
// `borremos`), with letter boundaries that know accents, since `\b` does
// not. `borrador` is a draft, not a delete.
const BORR_WORD = /(?<!\p{L})borr(?!ador)\p{L}*/giu;
// A sentence that says a record is not deleted (`no se borra`, `Suspender no
// borra datos`) describes the data, not an action the user takes. Only the
// third person: `no borres` is still an instruction to delete.
const NOT_DELETED = /(?<!\p{L})no (?:se )?$/iu;
const DESCRIBING_FORMS = new Set(["borra", "borran"]);

function borrarWord(text) {
  for (const match of text.matchAll(BORR_WORD)) {
    const word = match[0].toLowerCase();
    const before = text.slice(0, match.index);
    if (DESCRIBING_FORMS.has(word) && NOT_DELETED.test(before)) continue;
    return word;
  }
  return undefined;
}

const noBorrar = {
  meta: {
    type: "suggestion",
    docs: {
      description: "A delete says eliminar, not borrar.",
    },
    messages: {
      word: "Say `eliminar` (`elimina`, `eliminación`), not `{{word}}`: the button and the menu item say `Eliminar`, and a refusal or a confirmation that says `borrar` reads as another action. A file taken out of a field is `Quitar` (style guide, Interface text).",
    },
    schema: [],
  },
  create(context) {
    function check(node, text) {
      const word = text === undefined ? undefined : borrarWord(text);
      if (word) {
        context.report({
          node,
          messageId: "word",
          data: { word },
        });
      }
    }

    return {
      Literal(node) {
        if (typeof node.value !== "string") return;
        if (node.parent?.type === "ImportDeclaration") return;
        check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.cooked);
      },
      JSXText(node) {
        check(node, node.value);
      },
    };
  },
};

const SHARED_DIRECTORY_SEGMENT = `${path.sep}app${path.sep}components${path.sep}shared${path.sep}`;

function importsUiModule(source, filename, module) {
  if (source === `${UI_ALIAS_PREFIX}${module}`) return true;
  if (!source.startsWith(".")) return false;
  return path
    .resolve(path.dirname(filename), source)
    .endsWith(`${UI_DIRECTORY_SEGMENT}${module}`);
}

const confirmationShared = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "AlertDialog is used only by the shared confirmations in app/components/shared.",
    },
    messages: {
      inline:
        "Use a confirmation from app/components/shared (`ConfirmationDialog`, `DeleteDialog`, `WithdrawDialog`, `BlockedActionDialog`, `ArcaConfirmationDialog`) instead of an `AlertDialog` in a view: the shared one owns the question, the footer and the pending state, so every confirmation reads and behaves the same. A new kind of confirmation gets its own component there (style guide, Destructive actions).",
    },
    schema: [],
  },
  create(context) {
    if (`${context.filename}`.includes(SHARED_DIRECTORY_SEGMENT)) return {};

    return {
      ImportDeclaration(node) {
        if (
          importsUiModule(node.source.value, context.filename, "alert-dialog")
        ) {
          context.report({ node, messageId: "inline" });
        }
      },
    };
  },
};

const ALERT_ICONS = new Map([
  ["destructive", "CircleAlert"],
  ["warning", "TriangleAlert"],
  ["info", "Info"],
  ["success", "CircleCheck"],
]);
const ALERT_PARTS = new Set(["AlertTitle", "AlertDescription", "AlertAction"]);

// What an alert's children are, as far as one file shows: its icon, its
// parts, or something the rule cannot see into (a prop, a wrapper component).
// Whitespace and `{/* comments */}` render nothing.
function isBlankChild(child) {
  return (
    (child.type === "JSXText" && child.value.trim() === "") ||
    (child.type === "JSXExpressionContainer" &&
      child.expression.type === "JSXEmptyExpression")
  );
}

function alertChildren(node, uiImports, icons) {
  return node.children
    .filter((child) => !isBlankChild(child))
    .map((child) => {
      if (child.type !== "JSXElement") return { kind: "unknown" };
      const name = child.openingElement.name;
      if (name.type === "JSXIdentifier" && icons.has(name.name)) {
        return { kind: "icon", element: child.openingElement };
      }
      const part = uiImports.componentName(name);
      return ALERT_PARTS.has(part) ? { kind: part } : { kind: "unknown" };
    });
}

function checkAlertParts(context, opening, children, variant, icon) {
  // The rest needs every child in sight: a prop or a wrapper component may
  // bring the icon or the parts.
  if (children.some((child) => child.kind === "unknown")) return;
  if (!icon) {
    context.report({
      node: opening,
      messageId: "missingIcon",
      data: { icon: ALERT_ICONS.get(variant), variant },
    });
  }
  for (const part of ["AlertTitle", "AlertDescription"]) {
    if (!children.some((child) => child.kind === part)) {
      context.report({ node: opening, messageId: "part", data: { part } });
    }
  }
}

function checkAlertIcon(context, icon, variant) {
  const canonical = ALERT_ICONS.get(variant);
  if (icon.name.name !== canonical) {
    context.report({
      node: icon,
      messageId: "icon",
      data: { found: icon.name.name, icon: canonical, variant },
    });
  }
  if (findAttribute(icon, "className")) {
    context.report({ node: icon, messageId: "iconClass" });
  }
}

const alertStructure = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "An Alert has a variant, that variant's icon, a title and a description.",
    },
    messages: {
      variant:
        "Give <Alert> a `variant` of `info`, `warning`, `destructive` or `success`: the variant says what kind of message it is, and `default` says nothing (style guide, Alerts).",
      icon: "Draw `{{icon}}` in a `{{variant}}` alert, not `{{found}}`: each variant has one icon, so a message reads the same as an alert and as a toast (style guide, Alerts).",
      missingIcon:
        "Start a `{{variant}}` alert with `{{icon}}`: each variant has one icon, so a message reads the same as an alert and as a toast (style guide, Alerts).",
      iconClass:
        "Drop `className` from the alert's icon: `Alert` places it, beside the first line (style guide, Alerts).",
      part: "Give the alert an `{{part}}`: the title says what is going on in a few words, the description the detail and what to do (style guide, Alerts).",
    },
    schema: [],
  },
  create(context) {
    const uiImports = trackUiImports(context);
    const icons = new Set();

    return {
      ImportDeclaration(node) {
        uiImports.ImportDeclaration(node);
        if (node.source.value !== ICON_PACKAGE) return;
        for (const specifier of node.specifiers) {
          icons.add(specifier.local.name);
        }
      },
      JSXElement(node) {
        const opening = node.openingElement;
        if (uiImports.componentName(opening.name) !== "Alert") return;

        const variantAttribute = findAttribute(opening, "variant");
        if (variantAttribute && hasUnreadableValue(variantAttribute)) return;
        const variant = stringAttribute(opening, "variant");
        if (!ALERT_ICONS.has(variant)) {
          context.report({ node: opening, messageId: "variant" });
          return;
        }

        const children = alertChildren(node, uiImports, icons);
        const icon = children.find((child) => child.kind === "icon");
        if (icon) checkAlertIcon(context, icon.element, variant);

        checkAlertParts(context, opening, children, variant, icon);
      },
    };
  },
};

const PAGE_HEADER_SURFACES = ["admin", "portal"].flatMap((surface) => [
  `${path.sep}app${path.sep}features${path.sep}${surface}${path.sep}`,
  `${path.sep}app${path.sep}components${path.sep}${surface}${path.sep}`,
]);
// `dark:` as any of a class's variants: `dark:bg-x`, `md:dark:bg-x`.
const DARK_CLASS = /(?:^|\s)(?:[\w-]+:)*dark:\S/;
const FORM_EVENT_TYPES = new Set(["FormEvent", "FormEventHandler"]);

function isMember(node, property) {
  return (
    node?.type === "MemberExpression" &&
    !node.computed &&
    node.property.name === property
  );
}

// `HTMLFormElement.prototype.submit`.
function isPrototypeSubmit(node) {
  const prototype = node.object;
  return (
    isMember(prototype, "prototype") &&
    prototype.object.type === "Identifier" &&
    prototype.object.name === "HTMLFormElement"
  );
}

function isNativeFormSubmit(node) {
  const callee = node.callee;
  // `form.submit()`: React Router's `submit` and a fetcher's always take what
  // they send.
  if (isMember(callee, "submit") && node.arguments.length === 0) return true;
  // `HTMLFormElement.prototype.submit.call(form)`.
  return isMember(callee?.object, "submit") && isPrototypeSubmit(callee.object);
}

const restrictedSyntax = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Shapes the style guide bans outright, each with its reason.",
    },
    messages: {
      toastInfo:
        "Drop `toast.info`: a toast is a success or an error the server confirmed, and no product case has needed an informative one yet (style guide, Forms).",
      dark: "Drop the `dark:` class: the theme's tokens already carry the dark mode, and a hand-tuned dark look drifts from it (style guide, Theme).",
      h1: "Use the page header instead of an `<h1>`: `AdminResourceLayout` and `PortalPageHeader` title every page with an `h2` (style guide, Page header).",
      formEvent:
        "Type a submit handler with `React.SubmitEvent` (or `SubmitEventHandler`), not `FormEvent`: React 19 deprecates it because it does not describe a form's submit (style guide, Forms).",
      formSubmit:
        "Submit through React Router (`useSubmit`, a fetcher's `submit`, or `requestSubmit()`), not the native `form.submit()`: it skips the submit event, so React Hook Form's validation and the router never see it (style guide, Forms).",
    },
    schema: [],
  },
  create(context) {
    const filename = `${context.filename}`;
    const ownsPageHeader = PAGE_HEADER_SURFACES.some((segment) =>
      filename.includes(segment),
    );

    function checkClasses(node, text) {
      if (DARK_CLASS.test(text)) context.report({ node, messageId: "dark" });
    }

    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type === "MemberExpression" &&
          callee.object.type === "Identifier" &&
          callee.object.name === "toast" &&
          callee.property.name === "info"
        ) {
          context.report({ node, messageId: "toastInfo" });
        } else if (isNativeFormSubmit(node)) {
          context.report({ node, messageId: "formSubmit" });
        }
      },
      Literal(node) {
        if (typeof node.value === "string") checkClasses(node, node.value);
      },
      TemplateElement(node) {
        checkClasses(node, node.value.cooked ?? "");
      },
      JSXOpeningElement(node) {
        if (
          ownsPageHeader &&
          node.name.type === "JSXIdentifier" &&
          node.name.name === "h1"
        ) {
          context.report({ node, messageId: "h1" });
        }
      },
      ImportSpecifier(node) {
        if (
          node.parent.source.value === "react" &&
          FORM_EVENT_TYPES.has(node.imported.name)
        ) {
          context.report({ node, messageId: "formEvent" });
        }
      },
      TSQualifiedName(node) {
        if (
          node.left.type === "Identifier" &&
          node.left.name === "React" &&
          FORM_EVENT_TYPES.has(node.right.name)
        ) {
          context.report({ node, messageId: "formEvent" });
        }
      },
    };
  },
};

export default {
  meta: { name: "ui" },
  rules: {
    "no-raw-form-element": noRawFormElement,
    "no-restyle": noRestyle,
    "tabs-line-variant": tabsLineVariant,
    "data-icon-position": dataIconPosition,
    "dialog-width": dialogWidth,
    "actions-menu-text-only": actionsMenuTextOnly,
    "confirm-wording": confirmWording,
    "no-borrar": noBorrar,
    "confirmation-shared": confirmationShared,
    "alert-structure": alertStructure,
    "restricted-syntax": restrictedSyntax,
  },
};
