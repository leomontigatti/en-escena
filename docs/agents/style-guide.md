# Style Guide

Visual style guide for the product. The visual base is shadcn/ui `radix-nova`
with its components, CSS tokens and theme font.

## Visual direction

The interface must prioritize clarity, fast reading and repeated use over a
landing-page or showcase aesthetic.

- Use light surfaces, sharp hierarchy and sufficient contrast.
- Keep the experience suitable for forms, lists, tables and states.
- Avoid dominant decorative backgrounds, large gradients, ornamental decoration
  and marketing composition. Do not forbid dark backgrounds when they come from
  the dark theme or from shadcn components.

## Color and tokens

Use shadcn/ui semantic tokens as the source of truth. Do not hardcode Tailwind
colors (`slate`, `red`, `teal`, etc.) unless there is a specific need that cannot
be expressed with existing tokens or variants.

Rules:

- Use `background`, `foreground`, `muted`, `muted-foreground`, `border`, `input`,
  `ring`, `primary`, `primary-foreground`, `secondary`, `secondary-foreground`,
  `accent`, `accent-foreground`, `destructive`, `card` and `card-foreground`.
- For negative or error states, use `destructive` and the components' invalid
  states (`aria-invalid`, `data-invalid`).
- For positive, informative or warning states, prefer existing component variants
  (`Badge`, `Alert`). Do not add custom variants or new semantic tokens without
  an explicit decision.
- Do not introduce brand palettes, custom hex values or parallel scales without
  an explicit decision.

## Radii

Use the theme's radii (`--radius` and derivatives) and the classes the components
already define. Do not patch radii per screen with ad hoc classes, except for
layout or local composition.

## Typography

Use the current shadcn theme font. Do not add brand typefaces or alternative
families without an explicit decision.

Create hierarchy through components, variants, weight and spacing. Avoid manual
typographic classes on base components when the component already defines the
style.

## Density and layout

Use medium operational density. The interface must let you scan lists, forms and
states without feeling cramped.

Use `gap-*` for spacing between elements. Do not use `space-x-*` or `space-y-*`.
Respect shadcn components' sizes and internal padding; adjust with `className`
only for layout.

Use operational shells for the academy portal, the admin panel and judging.
Centered screens are reserved for authentication, errors and exceptional states.

Prioritize tables for operational lists. Use cards for the mobile surfaces
below or for simple repeated elements. Avoid dashboards with a large hero.

## Viewports

The product is used on desktop. Design at **1440px** wide, and keep every
screen working down to **1280px**, the floor: a 1366×768 laptop, or a
1920×1080 one at Windows' 150% scaling, which is 1280 CSS pixels. At 1280 the
admin sidebar leaves about 1000px of content, and that is the budget a table
or a form row has to fit. Nothing laid out beside the list may take from it:
filters and actions sit above the table, never in a side panel.

Below 1280 nothing is promised beyond not breaking: content may scroll
sideways, but must not overlap or become unreachable. Do not put a `min-width`
on the page to enforce the floor; it breaks the mobile surfaces and browser
zoom.

Only the public program is designed for phones. Judging is not, and waits for
a remake. Every other surface is desktop-only: responsive prefixes that keep a
form usable on a narrow window are fine, but do not design a mobile layout for
a screen that is not on this list.

## Base components

Use shadcn/ui `radix-nova` as the base. The components live in
`app/components/ui` and are treated as the visual source of truth.

Rules:

- Use existing components before creating custom markup. For a raw `<button>`,
  `<select>`, `<textarea>` or `<input>`, `pnpm lint` enforces this
  (`ui/no-raw-form-element`).
- If the needed shadcn component is not installed and the pattern repeats or the
  case clearly fits shadcn, add the component before creating a custom variant.
- Use the component's variants before overriding colors, radii, typography or
  states with `className`.
- Use `className` for layout: grid, flex, gap, width, margin and local
  composition.
- In new code, do not use `space-x-*` or `space-y-*`; use `flex`/`grid` with
  `gap-*`.
- Prefer responsive props or component variants where they exist before
  recreating behavior with classes. Example: `Field orientation="responsive"`.
- Avoid hardcoding visual look on shadcn components: colors, radii, shadows,
  typography and states. Hardcoding layout is allowed.
- If no token, variant or component exists for a unique case, a one-off class is
  acceptable. If the case repeats, extract it into a component, variant or token.
- Do not install components without a concrete use.
- Use `lucide-react` for icons and `data-icon` inside buttons.
- Use `cn()` for conditional classes.

## Alerts and empty states

Use shadcn components for feedback and empty states.

Rules:

- Use `Alert` for callouts, notices, errors not tied to a field, and success
  messages that persist on screen. If `Alert` is not installed and the case needs
  it, add it before creating custom markup.
- Use `Empty` for no-data states with a title, description and primary action. If
  `Empty` is not installed and the case needs it, add it before creating custom
  markup.
- Migrate existing callouts and empty states when the file is touched or in a
  dedicated pass.

### Alert variants

The variant says what kind of message it is, not how loud it should be:

| Variant       | For                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| `info`        | A state to know about, including a lock: why fields or actions are unavailable and what unlocks them |
| `warning`     | Something the user should fix, or will regret if they go ahead                                       |
| `destructive` | An error, or an action that cannot be undone                                                         |
| `success`     | An outcome that stays on screen (toasts carry the rest)                                              |

`default` is not used.

### Alert icons

Each variant has exactly one icon, imported under its canonical `lucide-react`
name, in the position `Alert` gives it (top, beside the first line):

| Variant       | Icon            |
| ------------- | --------------- |
| `destructive` | `CircleAlert`   |
| `warning`     | `TriangleAlert` |
| `info`        | `Info`          |
| `success`     | `CircleCheck`   |

No icon about the topic (`Trophy`, `Landmark`, `Ban`), no alias names
(`AlertTriangle`, `AlertCircleIcon`, `InfoIcon`), and no class that moves the
icon. An alert whose variant is chosen at run time picks its icon from the same
table (`AccessNotice` in `app/components/auth/access-ui.tsx` is the model).

### Alert content

Every `Alert` has an `AlertTitle` and an `AlertDescription`. The title says
what is going on in a few words; the description gives the detail and what to
do. A lead line that introduces a list is the title, and the list is the
description. Do not restyle a span into a headline or tighten the description's
paragraph spacing: the title is the headline.

A list inside an alert is a bulleted `ul` (`list-disc pl-5`) inside the
`AlertDescription`.

## States and badges

Use `Badge` with the variants defined in `app/components/ui/badge.tsx`. The
semantic variants `success`, `warning` and `info` are part of the current system
and can be used when they express a clear product state.

Rules:

- Use `Badge` instead of custom spans for states.
- Use `variant="destructive"` for negative states where appropriate.
- For positive, informative or warning states, use `success`, `info` or `warning`
  when that semantics is stable and documented by the flow.
- For neutral states, use variants such as `default`, `secondary` or `outline`.
- Do not add new `Badge` variants without an explicit product and design
  decision.

## Buttons

Use `Button` and its variants (`default`, `secondary`, `outline`, `ghost`,
`destructive`, `link`) and sizes (`xs`, `sm`, `default`, `lg`, `icon`, `icon-xs`,
`icon-sm`, `icon-lg`).

Use a single primary action per visual zone. Destructive actions must have clear
text and a confirmation when the effect is irreversible. Icon-only buttons must
have an accessible name and a tooltip when the icon is not obvious.

Rules:

- Page and form buttons use the default size. `sm` is for buttons inside a table
  row or an alert.
- A leading icon takes `data-icon="inline-start"`, which gives it the button's
  icon padding; a bare `data-icon` skips it.
- An icon repeats what the label says. `Check` is for saving, `Trash2` for
  deleting; a destructive action other than a delete carries its own icon or
  none. `Cancelar` has no icon.
- Delete reads `Eliminar` with `Trash2`, on a button, a menu item and the
  confirmation alike. The record is already named by the page.
- Obvious icons need no tooltip: `Trash2`, `X`, play and pause, `Download`,
  `Copy` and a drag handle. Every other icon-only button gets one. Text cut by
  truncation keeps a native `title` instead.

### Actions menu

A record's actions live in `ResourceActionsMenu`, the `⋯` button, whether on a
detail page's header or on a table row.

- Keep the trigger at its default size (`icon-lg`).
- Menu items are text only.
- Put a `DropdownMenuSeparator` before the destructive items, so they sit last
  and apart.

## Pending, loading and transitions

Pending feedback must be specific to the operation. Do not use a global spinner
or state that hides which request is working.

Rules:

- Use a pending state on the button when an action originates from a concrete
  button or submit and the user might retry it. Disable the action while the
  request is in flight and change the label or icon to show progress.
- Use a small inline spinner when a specific fragment of the screen updates
  without blocking the rest: auxiliary calculations, badges, summaries, counters
  or small panels.
- Keep the current rows or results visible while the table updates due to
  filters, search, pagination or refresh. Show the updating state inside the
  table or in its controls bar; do not empty the list or replace it with a
  full-page loader.
- Use skeletons only when there is a real deferred reveal or an initial load
  where the final structure is already known and improves reading. The skeleton
  must resemble the content that is going to arrive.
- Do not use skeletons for routes that still block until the loader finishes, nor
  for short mutations where a pending button state or inline spinner is enough.
- Keep shells, breadcrumbs, titles and context visible during requests when the
  screen already has useful data. Avoid the flicker of unmounting and remounting
  the whole view for a single operation.
- Evaluate View Transitions only after fixing request flow and pending states.
  Use them only when they communicate real continuity between views or stable
  states — for example list to detail, dialog open/close or a deferred content
  reveal.
- Do not use View Transitions as makeup for slow loaders, broad revalidations or
  persistent shells that do not change visual context.

## Forms

Forms use visible labels above the field. The placeholder can show an example or
a short rule — `Opcional`, `Mínimo 8 caracteres` — but it never replaces the
label.

Rules:

- Use the components in `app/components/ui/field.tsx` (`Field`, `FieldLabel`,
  `FieldContent`, `FieldError`, `FieldDescription`, `FieldGroup`,
  `FieldSeparator`, `FieldSet`, `FieldLegend`) to build form fields as
  appropriate.
- Use `FieldGroup` for field layout; not `space-y-*`.
- Use `Field orientation="responsive"` when the field must go from vertical to
  horizontal depending on available width.
- Mark the container with `data-invalid` when the field has an error, even if the
  error comes from client validation, so label, input and message share the
  visual state.
- Show errors with `FieldError` and `destructive` states.
- Show help with `FieldDescription`, and reserve it for explanation that must
  stay on screen while the field is being filled in. A rule short enough to fit
  the input goes in the placeholder instead.
- Do not rely only on an asterisk to indicate a required field; use clear copy
  when the context requires it.
- In React Hook Form forms, use the shared fields before defining local fields
  with `Controller`: `TextInputField`, `IntegerInputField`, `TextareaField`,
  `SelectField`, `ComboboxField`, `MultiComboboxField`, `DateOnlyField`,
  `TimeOnlyField` and `FileUploadField`. Create a local field only when the
  pattern does not yet exist as a shared component, or when the form needs a
  specific composition — for example dynamic arrays, checkbox groups, switches
  with their own UI logic or confirmation controls.
- Respect the height, border, focus and states of `Input`, `Checkbox`, `Select`,
  `DateOnlyField` and other existing controls. `pnpm lint` enforces the height,
  radius and focus ring part (`ui/no-restyle`).
- In forms and filters, when multiple options must be selected, use a
  multi-select `Combobox` instead of long checkbox lists. If `Combobox` is not
  installed and the case needs it, add it before creating custom markup.
- Use `Checkbox` for simple booleans submitted in a form.
- Use `Switch` for on/off preferences or settings. If `Switch` is not installed
  and the case needs it, add it before creating custom markup.
- Use `Checkbox` for a few visible options when the set is short and it is
  neither a filter nor a multiple relation of Event configuration. For long
  lists, Event configuration, filters and multiple relations, use a multi-select
  `Combobox`.
- Use shadcn's `Select` for single selection. Do not use a native `<select>` or
  `NativeSelect`.
- Use shadcn's `Textarea` for multiline text. Do not use a hand-styled native
  `<textarea>`.
- Migrate existing native selects and textareas when the file is touched or in a
  dedicated pass.
- In long forms, split into sections with a small title. Avoid nested cards.
- A row repeater (a `useFieldArray` of short rows) shows its column labels once,
  above the first row, and keeps an `sr-only` label on each row's fields.

### Form layout

A form page is one `AdminResourceFormCard` holding the whole form, with no card
header. Alerts about the form sit above the card.

- Wrap the alerts above the card in `AlertStack`
  (`app/components/shared/alert-stack.tsx`): it spaces them and renders nothing
  when none shows, so an empty wrapper never opens a gap under the header.
  Guard each alert where it is used (`condition ? <SomeAlert /> : null`). The
  stack only drops `null` and `false` children, so an alert component that
  returns `null` by itself still counts and leaves the gap.
- Lay the fields out in `FieldGroup className="grid gap-5 md:grid-cols-2"`. A
  field that needs the width spans both columns.
- The card has no maximum width. It fills the shell like the alerts, tabs and
  tables around it, so the page keeps one edge.
- The actions go in a footer pinned to the bottom of the viewport, so they stay
  in reach on a long form and rest on the bottom edge of a short page. It sits
  below the card, not inside it: `Card` clips its overflow, which stops a
  `sticky` child from sticking. The shared `BackButton` (`Volver`) sits on the
  left and the shared `SubmitButton` (`Guardar`) on the right, with
  `Descartar cambios` beside it when [Editing and saving](#editing-and-saving)
  asks for it.
- A form in a `Dialog` is one column, with `Cancelar` and then the primary action
  on the right of the footer.
- The portal's `Nueva coreografía` wizard is the exception: one column,
  `max-w-2xl` and its own sticky bar, because it walks through one step at a
  time.

## Editing and saving

How an edit screen saves decides the shape of its form, so settle it before
laying the fields out. What happens after the submit (stay or redirect, which
toast) is [form-feedback.md](form-feedback.md).

Rules:

- One save model per form. A form either waits for `Guardar` or saves each field
  on its own, never both: a select that writes on change beside fields that wait
  for `Guardar` is the case to avoid
  ([Primer, Saving](https://primer.style/product/ui-patterns/saving/)).
- Default to an explicit `Guardar`. Selects, comboboxes, multi-selects, checkbox
  lists and file fields wait for it: arrowing through a select already picks an
  option, and a screen reader user can only hear the options by picking them.
- Save on change only a single field that nothing else on the screen depends on,
  with its own confirm and cancel
  ([Atlassian, Inline edit](https://atlassian.design/patterns/inline-edit)). A
  field whose change recalculates others, or has consequences, never saves on
  its own.
- No edit mode. A detail page shows its fields editable in place, and a user
  who may not edit sees them disabled with only `Volver`. There is no `Editar`
  button, no `?modo=` parameter and no `Cancelar` in the footer.
- `Guardar` stays disabled until something differs from what is saved, and while
  a submit or a preview is in flight. After a server error it stays enabled: the
  action refills the form with what was typed, which reads as unchanged. A
  successful save starts a clean draft from what was saved. Create forms follow
  the same rule, measured against their empty defaults.
- A form that edits more than one field offers `Descartar cambios` beside
  `Guardar` while it has changes, and it resets the form without leaving.
- A form with unsaved changes asks before it is left, through the shared
  `DiscardChangesDialog`. On a page the guard sits on the router (`useBlocker`
  plus `beforeunload`), not on `Volver`: the sidebar, the breadcrumbs, the
  browser's back and a closing tab are ways out too. `Volver` stays the same
  plain link. The save's own submission is never asked about. In a `Dialog`,
  `Cancelar`, the close button and Esc go through `useDiscardGuard`.
- Fields that affect each other stay on one screen, visible together. Do not
  split them across `Tabs`, steps or dialogs: a change in one tab that rewrites a
  field in another is a change the user does not see
  ([NN/g, Tabs, Used Right](https://www.nngroup.com/articles/tabs-used-right/)).
- When a change makes the server recalculate other fields, preview it: send the
  draft through a fetcher, show the pending state on the fields that will change
  ([Pending](#pending-loading-and-transitions)), and update them in place. The
  preview writes nothing. The action re-checks everything when `Guardar` writes,
  because the preview is older than the write.
- Confirm on `Guardar` only when the save has consequences beyond the fields the
  user edited, such as withdrawn dancers, a deleted presentation, a moved
  schedule or a price change. Name each one in the `AlertDialog`
  (`Bea Lagos (queda retirada)`, not `algunos bailarines`). A save without consequences goes
  straight through: a dialog on every save teaches people to click past it
  ([NN/g, Confirmation dialogs](https://www.nngroup.com/articles/confirmation-dialog/)).
- An action `intent` is a server boundary: one operation with its own checks and
  transaction. It does not decide how the screen splits into forms. One
  `Guardar` may submit a draft that the action applies as several operations in
  one transaction. Two intents are no reason for two forms, or for locking one
  part of the screen while another has unsaved changes.
- Migrate an existing screen that breaks these rules when the file is touched or
  in a dedicated pass.

## React Hook Form

Use React Hook Form for forms with client validation, controlled components,
derived state or several related fields. Follow shadcn's React Hook Form pattern:
`useForm`, a Zod resolver, `Controller` when the control needs it, and `Field`
components.

Rules:

- Every React form in the application uses React Hook Form, Zod and shadcn/ui
  components as the default pattern, regardless of surface (`Panel de administración`,
  `Portal de academias`, auth, judging or public views).
- Define the schema with Zod and pass it to `useForm` via `zodResolver`.
- Derive the form types from the schema when there is Zod validation: use
  `z.input<typeof schema>` for the form's editable values and
  `z.output<typeof schema>` for already validated/normalized values. Avoid
  casting `zodResolver`; if TypeScript asks for a cast, first check whether the
  manual types are diverging from the schema.
- Reuse the same schema or equivalent rules in the server action so client and
  server do not diverge.
- Keep mutations in React Router `action`/`fetcher` server-side. RHF validates
  and controls state on the client; the action re-validates, authorizes and
  persists.
- Use the shared form components when they cover the case: `TextInputField`,
  `IntegerInputField`, `TextareaField`, `SelectField`, `ComboboxField`,
  `MultiComboboxField`, `DateOnlyField`, `TimeOnlyField` and `FileUploadField`.
  These components own their `Controller`; screens pass them `control`, `name`,
  copy and options.
- Use `Controller` locally only for controlled components that do not yet have a
  shared wrapper, or for specific compositions such as `Checkbox`, `Switch`,
  dynamic arrays and a screen's custom fields.
- For simple inputs, prefer the shadcn pattern with `Controller` and spreading
  `field` when the form already uses React Hook Form. Keep `register` only in
  simple forms where it does not complicate consistency.
- Show errors with `FieldError`; mark `data-invalid` on `Field` and
  `aria-invalid` on the control.
- Validate required fields on the client. For empty required fields, always use
  the message `Este campo es obligatorio.`, including `Select`, `Combobox`,
  multiple checkboxes and empty arrays. Reserve specific messages for values that
  are present but invalid.
- Do not use HTML validation (`required`, `minLength`, `pattern`) as the primary
  UX or as a substitute for React Hook Form. Semantic or input attributes such as
  `type`, `min`, `max`, `step`, `maxLength`, `autoComplete` and `aria-required`
  are allowed when they add accessibility or input constraints without replacing
  RHF/Zod validation.
- Do not render manual inline errors with ad hoc paragraphs or red classes. Use
  `FieldError` and the field's shadcn/ui states. If an external component cannot
  integrate cleanly with this pattern, document the exception with a short
  comment and create explicit debt to migrate it.
- For `Select`, pass `field.value` and `field.onChange` to the `Select`
  component, and put `aria-invalid` on `SelectTrigger`.
- For dynamic arrays, use `useFieldArray`, `FieldSet`, `FieldLegend` and
  `FieldDescription`; use `field.id` as the key.
- Show only client validation errors inline. Errors returned by the server are
  not integrated with `form.setError` and are not shown as `FieldError`; they are
  shown with a toast and, when useful, the form keeps the submitted values so the
  person can correct and resubmit.
- When an RHF form posts to a React Router action with `useSubmit`, use
  `createValidatedRouteFormDataSubmitHandler` so the submitted `FormData` is built
  from the values RHF validated, preserving `intent`, submit buttons and other
  hidden DOM fields. Use `createValidatedRouteSubmitHandler` only when you
  explicitly want to submit the DOM target without rewriting it from the RHF
  values.
- In effects that call RHF methods (`reset`, `setError`, etc.), destructure the
  method and use it in the dependencies (`const { reset } = form`) instead of
  depending on the whole `form` object.
- RHF forms must not end in `form.submit()` or
  `HTMLFormElement.prototype.submit()`. After validating with RHF, submit through
  React Router with `useSubmit`, `useFetcher.submit` or the appropriate shared
  helper.
- Use `useSubmit` when the submit must preserve the route's navigation or
  redirect semantics. Use `useFetcher.submit` when the screen, modal or dialog
  must stay mounted during recoverable errors.
- Shared submit helpers must build and send `FormData`, not a
  `Record<string, string>`, to preserve repeated fields, arrays, multiple
  checkboxes and future files.
- Show server action feedback with toasts:
  - Success confirmed by the server: `toast.success`.
  - Error confirmed by the server, with or without `fieldErrors`: `toast.error`.
    Do not duplicate those errors in inline fields; inline validation belongs to
    the RHF/Zod client schema.
  - For successes after a redirect, carry the message in the flash session
    (`app/lib/shared/flash-notification.server.ts`). The `notificacion` search
    parameter was removed in #416 — see
    [form-feedback.md](form-feedback.md). Keep the messages, IDs and
    `success | error` variants in a common map
    (`app/lib/shared/notification-toasts.ts`). Do not use `toast.info` until
    there is a concrete product case that needs it.
  - A submit that fails unexpectedly (a service throwing, the network dropping)
    also arrives as an error result, because every route module with an `action`
    exports the `clientAction` that produces it. The view stays mounted, so it
    must read that generic `{ status: "error", message }` as well as its own
    result shapes — see [form-feedback.md](form-feedback.md).
  - Do not use inline `Alert` or `Notice` for server confirmations or errors
    unless the message must remain as a persistent screen state. Use inline
    alerts only for current conditions, warnings before acting or visible screen
    constraints; not for the result of an already submitted action.
- Type submit handlers as `React.SubmitEvent<HTMLFormElement>` or
  `React.SubmitEventHandler<HTMLFormElement>`. Do not use `React.FormEvent` or
  `React.FormEventHandler` for forms: in React 19 those types are deprecated
  because they do not represent real form events.
- Migrate existing manual forms to React Hook Form when the file is touched or in
  a dedicated pass, prioritizing forms with client validation, selects,
  comboboxes, multiple checkboxes and derived state.

## Destructive actions

Destructive actions use confirmation dialogs. Do not use forms with confirmation
checkboxes for destructive actions.

Rules:

- Confirm the action with clear copy in the dialog.
- Use `Button variant="destructive"` for the final action.
- Keep complex forms out of destructive confirmations.
- Migrate existing checkbox-based destructive actions when the file is touched or
  in a dedicated pass.

### `AlertDialog` vs. `Dialog`

A single explicit rule for choosing the component:

- **`AlertDialog`**: yes/no confirmations and consequential actions (delete,
  archive, verify, save changes on a consequential record). It exposes
  `role="alertdialog"`, traps focus and does **not** close on outside click;
  Escape closes it, as `Cancelar` does. Its look is smaller, with a centered
  header and a footer bar: that is the "confirmation" look.
- **`Dialog`**: forms and views (create/edit resources, detail panels). It closes
  via overlay/Escape and has an X button.

For deletion confirmations use the shared `DeleteDialog` component
(`app/components/shared/delete-dialog.tsx`), built on `AlertDialog`: it
centralizes `isPending` (disables + spinner on the destructive button), the
`isBlocked` mode (hides the destructive button and shows a blocking
title/description) and the `details` slot. Do not duplicate that logic or
hand-roll a `Dialog` for deleting.

A confirmation reads the same wherever it appears:

- The title is a question naming the action and its object, such as
  `¿Eliminar la coreografía?`, `¿Guardar los cambios?` or
  `¿Anular el comprobante?`. Not `Confirmar …`.
- The footer holds `Cancelar` and then the verb from the title (`Eliminar`,
  `Guardar`, `Anular`), never a generic `Confirmar` or `Aceptar`. The verb button
  carries the icon [Buttons](#buttons) gives that verb, and is `destructive` only
  when the action destroys or reverses something.
- A confirmation is a shared component in `app/components/shared/`, not an
  `AlertDialog` written inline in a view: `DeleteDialog` for deletions,
  `WithdrawDialog` for withdrawals, `DiscardChangesDialog` for leaving unsaved
  changes. A new kind of confirmation gets its own component there.

Both keep their default width: no `size` prop, no `max-w-*`. The one exception
is an `AlertDialog` that carries a list, a preview or an alert, such as the
withdrawn dancers a save names: it widens with `className="sm:max-w-lg"`, the
`Dialog` width, so each line fits on one. `DeleteDialog` keeps the default
even with its alert and `details`.

## Navigation

Each context uses a shell matching its operational intensity.

| Context                   | Shell                                                              |
| ------------------------- | ------------------------------------------------------------------ |
| `Panel de administración` | Sidebar on desktop, topbar with user and actions, dense navigation |
| `Portal de academias`     | Topbar with secondary navigation or tabs                           |
| Judging                   | Focused layout, minimal topbar, next presentation prominent        |
| Public views              | Simple topbar, readable content, visible filters                   |
| Authentication            | Centered card                                                      |

Do not use a hero as the main structure of operational navigation.

Rules:

- Use `Sidebar` for the admin panel's main navigation.
- Use `Breadcrumb` for hierarchy and location within deep routes. The last
  crumb repeats the page title: `Nueva categoría`, not `Nueva`.
- Use `Tabs` for secondary navigation between sibling views. If `Tabs` is not
  installed and the case needs it, add it before creating custom markup. Do not
  use them to split one form whose fields affect each other
  ([Editing and saving](#editing-and-saving)).
- `Tabs` take `variant="line"`.
- Tabs that switch between subsets of the same data (`Coreografías` /
  `Seminarios`) keep the active tab in the URL, replacing the history entry, so
  a reload or a shared link lands on the same tab. The parameter names what the
  tab picks: `?tipo=` for `Coreografías` / `Seminarios`, `?dia=` for a day.
- Tabs that split one record into sections keep their state local. When they
  hold form fields, the form submits from its React Hook Form values
  (`createValidatedRouteFormDataSubmitHandler`): Radix unmounts the hidden
  panel, so a submit built from the DOM drops that tab's fields.
- Use `DropdownMenu` for contextual actions.
- Do not build navigation with hand-styled buttons or links when an equivalent
  shadcn component exists.

## Page header

Every page opens with its surface's shared header: `AdminResourceLayout` in the
admin panel, the portal's shared header in the academy portal (`PortalListPage`
on a list).

- The title is an `h2` on every page, detail pages included, and a description
  always follows it.
- A detail page's title is the record's name (`Luna de Papel`), not its type
  (`Detalle coreografía`).
- The actions slot holds the list's create button (`action`, which always draws
  `Plus`), the detail page's `⋯` menu ([Actions menu](#actions-menu)), or
  nothing. Any other link or button goes through `headerAction` or the menu.

## Detail pages

A record's detail page shows its data as locked inputs (`disabled`, with the
lock icon), in the same grid as its edit form, so viewing and editing look
alike. Pages about money, scores or documents use `MetricCard`s and tables
instead.

- When the record's state locks fields, an `Alert` above the form says why and
  what unlocks them.
- An action the record's state forbids is disabled before it is clicked, never
  refused after: the `⋯` menu item or button is `disabled`, and an `info`
  `Alert` above the form lists every reason, for auditors too. The disabled
  control gets no tooltip: a tooltip cannot hold a list and does not reach
  touch screens. The blocked mode of `DeleteDialog` is only for the dialog
  opened straight from the URL. The server still refuses, for the race.
- Every shared field draws the lock icon when disabled, `TextareaField`
  included. A `Switch` does not: its disabled look already reads as locked.

## Tables and lists

Use tables as the default pattern for operational lists, especially in
administration. On a mobile surface, adapt to compact cards or stacked lists.

Rules:

- Use `Table` or derived components such as `DataTable` before creating custom
  tables.
- Keep header, hover, cell and state styles inside the shared component when the
  pattern repeats.
- Use badges for states.
- Use a per-row actions menu when there are more than two actions.
- Show bulk actions only when there is an active selection.
- Keep the search box and the faceted filters in one toolbar above the table.
  Each applied filter is a button group: the field as muted text (with its
  icon, when the group has one), the value as a button whose menu picks another
  single value, and a trash button that removes it. The rest are added from the
  "Agregar filtro" icon button, which hides once every group is applied. The
  table keeps its full width: do not put filters in a panel, `Sheet` or
  `Dialog` that takes room from the list or covers it.
- Draw a value the way the list already draws it: a status reads as its badge
  (`renderValue` on the group). Give a group the icon the sidebar uses for its
  concept, so a field reads the same everywhere.
- A value's menu has no search; the add picker offers one for a group of more
  than seven values. This is the single-select case only: a filter that takes
  several values at once is still a multi-select `Combobox`, as the forms rules
  say.
- Use a sticky header only on long lists.
- Leave a list on the default `auto` layout unless it actually overflows. `auto`
  lets each column ask for the width it needs, and forcing a table with narrow
  columns —a number, a date, a badge, an amount— to fill the page only spreads
  short content across it.
- Reach for `layout="fit"` on a list that does overflow, which in practice means
  one with several free-text columns. Give every column a `width`, and cut the
  long cells with `DataTableTruncatedText` rather than letting them wrap.
  Tune the weights so every header fits at the 1280px floor, taking the room
  from the free-text columns that truncate anyway: a share that fits at 1280
  only grows wider above it.
- A `width` is a share of the row, not a percentage: the table divides each
  column by the total. Do not make them add up to 100 — the selection checkbox
  is a column the view never declares, and a budget balanced to 100% would
  overflow the row by exactly its width.

## Cards and panels

Use cards sparingly. Do not use them as the general page structure.

Rules:

- Card: repeated item, modal, authentication, empty state or one-off summary.
- Panel: grouping of a form or detail section.
- Section: page block without a box, separated by spacing and a heading.
- Do not nest cards inside cards.
- Use `Card` for visual panels with a border or surface.
- Use `<section>` without a card when only semantic separation or spacing is
  needed.
- If the panel has a title or description, use `CardHeader`, `CardTitle` and
  `CardDescription`.
- If the panel only groups content without its own title, use `CardContent`.
- Use the full composition where appropriate: `CardHeader`, `CardTitle`,
  `CardDescription`, `CardContent`, `CardFooter`.
- Do not override `Card`'s color, border, radius or shadow except for a very
  concrete local need.
- Migrate custom panels with a border/surface to `Card` when the file is touched
  or in a dedicated pass.

## Interface text

The entire visible interface is in Spanish. Use a neutral, direct and operational
Rioplatense tone.

Rules:

- Use forms such as `Ingresá`, `Revisá`, `Completá`.
- Avoid a marketing tone in operational flows.
- Name buttons with a verb and an object where it helps: `Guardar cambios`,
  `Registrar pago`, `Publicar resultados`.
- In empty states, explain the cause and the next available action.
- In errors, state what to correct. Use generic messages only as a fallback.
- In administration, use canonical glossary terms such as `Coreografía`,
  `Presentación` and `Estado financiero`.
- In the academy portal, avoid internal jargon when it does not help the action.
- Use lowercase for domain terms inside sentences (`Nuevo bailarín`,
  `Editar profesor`, `Guardar coreografía`) unless they start a sentence, appear
  in titles/sections, or are proper nouns. Fix existing inconsistencies when the
  screen is touched.

## Theme

Keep the shadcn `radix-nova` theme and its light/dark tokens. Do not remove dark
support coming from shadcn, but do not design a custom dark experience or add
custom `dark:` overrides either, except for a concrete need.

The product can operate in light by default. If dark mode later becomes a
requirement, use the theme's tokens instead of hardcoding colors per screen.
