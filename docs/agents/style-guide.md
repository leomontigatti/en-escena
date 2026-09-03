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

Prioritize tables for operational lists on desktop. Use cards for mobile or
simple repeated elements. Avoid dashboards with a large hero.

## Base components

Use shadcn/ui `radix-nova` as the base. The components live in
`app/components/ui` and are treated as the visual source of truth.

Rules:

- Use existing components before creating custom markup.
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

Forms use visible labels above the field. The placeholder can show an example,
but it never replaces the label.

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
- Show help with `FieldDescription`.
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
  `DateOnlyField` and other existing controls.
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
  - For successes after a redirect, use a centralized route notification through
    a search parameter (`notificacion`) or the shared mechanism replacing it.
    Keep the messages, IDs and `success | error` variants in a common map. Do not
    use `toast.info` until there is a concrete product case that needs it.
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
  `role="alertdialog"`, traps focus and does **not** close on outside click or
  Escape. Its look is smaller, with a centered header and a footer bar: that is
  the "confirmation" look.
- **`Dialog`**: forms and views (create/edit resources, detail panels). It closes
  via overlay/Escape and has an X button.

For deletion confirmations use the shared `DeleteDialog` component
(`app/components/shared/delete-dialog.tsx`), built on `AlertDialog`: it
centralizes `isPending` (disables + spinner on the destructive button), the
`isBlocked` mode (hides the destructive button and shows a blocking
title/description) and the `details` slot. Do not duplicate that logic or
hand-roll a `Dialog` for deleting.

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
- Use `Breadcrumb` for hierarchy and location within deep routes.
- Use `Tabs` for secondary navigation between sibling views. If `Tabs` is not
  installed and the case needs it, add it before creating custom markup.
- Use `DropdownMenu` for contextual actions.
- Do not build navigation with hand-styled buttons or links when an equivalent
  shadcn component exists.

## Tables and lists

Use tables as the default pattern for operational lists on desktop, especially in
administration. On mobile, adapt to compact cards or stacked lists.

Rules:

- Use `Table` or derived components such as `DataTable` before creating custom
  tables.
- Keep header, hover, cell and state styles inside the shared component when the
  pattern repeats.
- Use badges for states.
- Use a per-row actions menu when there are more than two actions.
- Show bulk actions only when there is an active selection.
- Keep filters at the top in a compact bar; use a large panel only for advanced
  filters.
- Use a sticky header only on long lists.

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
