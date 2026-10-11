# Style guide

The judgement calls of the product's interface, one decision each with its
reason and a component that already gets it right. The base is shadcn/ui
`radix-nova`: its components in `app/components/ui`, its tokens and its font.

The mechanical rules live in `pnpm lint`, each message carrying its reason
(listed atop `scripts/oxlint-ui-plugin.mjs`), and in `pnpm check:repo-styles`
(theme colours, `gap` over `space-*`); where they disagree with this page, they
are current.

## Theme

- **Operational, not showcase**: light surfaces, sharp hierarchy, medium
  density, for screens read and filled in all day.
- **Tokens and variants before classes.** A colour, radius or state comes from
  a token or a component variant; `className` is for layout (grid, flex, gap,
  width, margin). A case with no token gets a one-off class; a second case
  gets a variant or a component. A new token, variant or typeface is a product
  decision, not a fix.
- **A state is a `Badge`**: a semantic variant (`success`, `info`, `warning`,
  `destructive`) when its meaning is stable, a neutral one otherwise.
- **A shadcn component before custom markup**, added when the case fits it
  ([shadcn.md](shadcn.md)), never installed without a use.

## Viewports

- **Design at 1440 px; everything works down to 1280 px**, a 1366×768 laptop
  or a 1920×1080 one at 150%. At 1280 the admin sidebar leaves about 1000 px:
  that is the budget of a table or a form row. Filters and actions sit above
  the list, never in a side panel.
- **Below 1280, nothing breaks**: content may scroll sideways, never overlap.
  No page `min-width`: it breaks phones and zoom.
- **Phones:** the public program, and the portal screen by screen: one built
  or changed works at 390 px. The admin panel is desktop-only.

## Alerts

Which channel carries a message (alert, toast or field) is
[form-feedback.md](form-feedback.md#which-channel-carries-a-message).

- **An alert's variant says what kind of message it is**, not how loud:
  `info` a state to know, including a lock and what unlocks it; `warning`
  something to fix or regret; `destructive` an error or what cannot be undone;
  `success` an outcome that stays on screen.
- **The title says what is going on in a few words; the description gives the
  detail and what to do, never repeating the title.** A lead line that
  introduces a list is the title.
  A list is a bulleted `ul` in the description; a reason that can only be one
  is a sentence. An alert whose variant is chosen at run time picks its icon
  from the same table: `AccessNotice` (`app/components/auth/access-ui.tsx`).
- **Alerts above a form go in `AlertStack`**, each guarded where it is used
  (`condition ? <Alert /> : null`), so an empty stack leaves no gap.
- **A toast looks like its alert.** `AppToaster` sets the icons once from
  `alertVariantIcons`; leave Sonner's duration unless a case needs another,
  with the reason beside it. A toast's button is a `link` button in the
  toast's colour that dismisses it: `useRosterRefusalToast`
  (`app/components/shared/roster-document-conflict.tsx`).

## Buttons

- **One primary action per visual zone.** Page and form buttons take the
  default size; `sm` is for a table row or an alert.
- **An icon repeats the label**: `Check` saves, `Trash2` deletes, `Cancelar`
  has none. A delete reads `Eliminar` alone: the page already names the record. A destructive action other than a delete carries its own icon or
  none.
- **An icon-only button has an accessible name and a tooltip**, unless its
  icon is obvious: `Trash2`, `X`, play and pause, `Download`, `Copy`, a drag
  handle, `Volver`'s chevron. Text cut by truncation keeps a native `title`.

### Actions menu

- **A page's actions live in `ResourceActionsMenu`** (`Acciones`, after the
  `Ellipsis` icon, no tooltip). A `DropdownMenuSeparator` sets the
  destructive items apart, last.
- **Two actions that undo each other are one item**, the one the record's
  state calls for (`Publicar resultado` / `Ocultar resultado`). Any other item
  the state forbids stays enabled and opens `BlockedActionDialog`
  ([Detail pages](#detail-pages)).

## Pending and transitions

- **Pending shows on what is working**, never as a global spinner. The button
  that started a request is disabled and shows a spinner; `Cancelar` and every
  other footer action are disabled with it, so the form cannot be closed or
  resubmitted mid-request. `Volver` is a link through the leave guard and
  stays live.
- **A fragment that updates alone gets an inline spinner**; a table that
  refreshes keeps its rows, and a screen with data keeps its shell, breadcrumbs
  and title mounted.
- **Skeletons only for a deferred reveal** whose structure is known, shaped
  like what arrives.
- **One view transition between pages: the record title**, morphing from its
  row's `DataTableLink recordTitle` into the detail's title and back; every
  other page change swaps without a crossfade.

## Forms

- **Labels sit above the field.** A placeholder shows an example or a short
  rule (`Opcional`, `Mínimo 8 caracteres`), never the label. The exception is
  a row repeater: each field keeps an `sr-only` label and the placeholder names
  it; the column labels show once, above the first row.
- **`FieldDescription` holds what must stay on screen while filling in.**
- **Several options are picked in place with `ChecklistField`**
  (`app/components/shared/checklist-field.tsx`), never in a popover that covers
  what follows. Up to eight options it is a plain checkbox group; from nine on
  it adds a search and the `Todos | Seleccionados` tabs, because only then
  does the list scroll (#1262). An empty selection that means something says it
  in a `FieldDescription`, since a checklist has no placeholder (the schedule's
  `Categorías`: none checked accepts them all); options another field takes
  away are unchecked with it. One pick shown in place is `OptionCardsField`;
  both draw `ChoiceCard`s.
- **`Checkbox` for a boolean submitted with the form, `Switch` for a setting
  that reads as on or off.**
- **A shared field (`app/components/shared/*-field.tsx`) before a local
  `Controller`**, which is for what has no shared field yet.
- **A required field is said in words when the context needs it**, never by an
  asterisk alone. An empty required field reads `Este campo es obligatorio.`,
  whatever the control; a specific message is for a value that is present and
  wrong.
- **Validate on submit.** No field shows an error before `Guardar`; from then
  on its error follows what is typed. A running total beside the fields is not
  a field and may show its state live.
- **Client errors are inline (`FieldError`, `data-invalid`); server errors are
  a toast**, with the submitted values kept so they can be corrected.
- **A long form splits into titled sections**, never nested cards.

### Forms in code

- **Every form is React Hook Form with a Zod schema and shadcn fields**, on
  every surface. The one exception is an action-only form: a submit button and
  hidden inputs, no editable control (logout, a delete).
- **The server action reuses the schema or its rules** and re-validates,
  authorizes and persists; the client only validates and holds state. HTML
  validation (`required`, `pattern`) never stands in for it; input attributes
  such as `type`, `min` and `autoComplete` are welcome.
- **Types come from the schema**: `z.input` for the form's values, `z.output`
  for the validated ones. A cast on `zodResolver` means the types drifted.
- **A form posts through React Router**: `useSubmit` when the submit keeps the
  route's navigation or redirect, a fetcher when the screen or dialog must stay
  mounted through a recoverable error. Build the body with
  `createValidatedRouteFormDataSubmitHandler`, which sends a `FormData` from the
  values React Hook Form validated and keeps `intent` and hidden fields.

### Form layout

- **One `AdminResourceFormCard` holds the whole form**, with no header and no
  maximum width; alerts about the form sit above it in `AlertStack`.
- **Fields go in `FieldGroup className="grid gap-5 md:grid-cols-2"`**; a field
  that needs the width spans both.
- **The actions close the card as its last row**: `FormActions` (`PinnedActions`
  on a read-only page) as the card's `footer`, `BackButton` on the left,
  `SubmitButton` on the right with `Descartar cambios` beside it when there is
  more than one field. The row is sticky, and while it is on the page the page
  scrolls focus clear of it (`scroll-padding-bottom`, `app/app.css`), so a
  pinned bar is always `PinnedActions`. It stays one row on a phone: below
  `sm`, `Volver` shrinks to its chevron. A plain `Card` holding it takes
  `overflow-clip`, since `overflow-hidden` stops a sticky child.
- **A form in a `Dialog` is one column**, `Cancelar` then the primary action.
  The portal's `Nueva coreografía` wizard puts each step in one card, closed
  by `PinnedActions`.
- **With tabs, the footer goes where the form is**: closing the fields' tab
  when one tab holds the form, closing the card around the tabs when one form
  spans them (the event's detail). A panel keeps `forceMount` and hides when
  inactive only when it holds something a switch must not lose: a picked file,
  fields another tab's `Guardar` posts, the leave guard.

## Editing and saving

What happens after the submit is [form-feedback.md](form-feedback.md).

- **One save model per form: an explicit `Guardar`.** Selects, checklists and
  file fields wait for it too, since arrowing through a select already picks
  ([Primer, Saving](https://primer.style/product/ui-patterns/saving/)). Only a
  single field nothing else depends on may save on its own, with its own
  confirm and cancel.
- **No edit mode.** A detail page shows its fields editable in place; a user who
  may not edit sees them disabled with only `Volver`.
- **`Guardar` is disabled until something differs from what is saved**, and
  while a submit or a preview runs; after a server error it stays enabled.
  Create forms measure against their empty defaults.
- **Leaving with unsaved changes asks**, through `DiscardChangesDialog`: on a
  page the guard sits on the router (`useBlocker` and `beforeunload`), since
  the sidebar, the breadcrumbs and the browser's back are ways out too; in a
  dialog, `useDiscardGuard`.
- **Fields that affect each other stay on one screen**, never split across
  tabs, steps or dialogs ([NN/g, Tabs](https://www.nngroup.com/articles/tabs-used-right/)).
  When a change makes the server recalculate others, preview it through a
  fetcher, pending on the fields that will change; the save re-checks it.
- **Confirm a save only when it has consequences beyond the edited fields**,
  and name each one (`Bea Lagos (queda retirada)`). A dialog on every save
  teaches people to click past it.
- **An action `intent` is a server boundary**, not a reason to split a screen
  into forms: one `Guardar` may post a draft the action applies as several
  operations in one transaction.

## Destructive actions

- **An `AlertDialog` confirms; a `Dialog` holds a form or a view.** The
  `AlertDialog` traps focus and ignores an outside click, which is what a
  yes/no on a consequential action wants.
- **A confirmation that waits on its request passes `isPending` to
  `ConfirmationDialog`**, which keeps it open, and the caller closes it once
  settled (`useCloseOnceSettled`).
- **The verb is `destructive` only when the action destroys or reverses.**
- **A destructive action is confirmed in a dialog**, never by a checkbox on a
  form, and complex forms stay out of a confirmation.

## Navigation

- **The last breadcrumb repeats the page title**: `Nueva categoría`.
- **Tabs switch between sibling views**, never through the fields of one form.
  A controlled `Tabs` switches through `onValueChange`, so the arrow keys work.
- **Tabs that switch what a page lists keep the tab in the URL** through
  `useUrlTab` (`app/lib/shared/url-tab.ts`), which owns the default, the
  history entry, the reset page and the parameter names (`?tipo=`, `?dia=`).
  Tabs inside one record, a card or a control keep their state local.
- **A record with tabs keeps its form in one of them**: the tabs outside the
  card, every other tab a table of its own (the dancer's details, a seminar's
  `Inscriptos`). The event's detail is the exception: one form spans its tabs,
  and a refused save brings the erring tab forward.

## Page header

- **Every page opens with its surface's header**: `AdminResourceLayout`, or
  `PortalPageHeader` (`PortalListPage` on a list), a title and always a
  description.
- **A detail page's title is the record's name**, then its number:
  `Luna de Papel # 007` for a choreography (registration number),
  `Luna de Papel · N.º 1` for a presentation (place in the program).
- **The header's action slot** holds the list's create button (`Plus`), the
  `Acciones` menu, or nothing; anything else goes through `headerAction`.

## Detail pages

- **A record's data shows as locked inputs in its form's grid**, so viewing and
  editing look alike. Money, scores and documents use `MetricCard`s and tables.
- **Fields the record's state locks render as the shared read-only fields**
  (`ReadOnlyField` and its siblings), under an `info` alert that lists every
  reason and what unlocks it, or says the lock is for good, and speaks of the
  fields only. Every role that sees the record sees it. A field with no
  meaning for the record is left out: not applicable is not blocked.
- **An action the state forbids is never disabled and never refused after the
  submit**: it opens `BlockedActionDialog`, whose `info` alert lists every
  reason that concerns the action and whose only button is `Cerrar`; a blocked
  `DeleteDialog` says what it takes to delete. A disabled control cannot say
  why, and a page alert would sit on nearly every record. The server still
  refuses, for the race. A submit disabled until the form is complete or
  changed is not such a block.
- **Every shared field draws the lock icon when disabled**; a `Switch` does
  not, its disabled look already reads as locked.

## Tables and lists

- **Operational lists are tables** (`ClientDataTable`, `ServerDataTable`).
  On a phone, `renderCard` turns rows into cards below `sm`, holding every
  column the table has except the empty ones: name and number, then what the
  row is, then what the list is about, nothing truncated. The portal
  `Resultados` list is the reference; program lists build on `ProgramRowCard`.
  A card has no sort header, selection or reordering: a list that needs one on
  a phone needs its own design first.
- **No actions column.** A row's actions are reached from its name: its detail
  page, or a `link` button opening a `Dialog` for a record with no page; when
  the state forbids them all, the name opens `BlockedActionDialog`.
- **Bulk actions show only with a selection.**
- **Search and filters share one toolbar above the table.** An applied filter
  is a button group: the field, its value as a menu, a trash button; the rest
  come from `Agregar filtro`. A value reads the way the list draws it (its
  badge), with the icon the sidebar gives its concept. A value's menu has no
  search; the add picker gets one past seven values.
- **Every row is one height, 40 px, set by the shared table**
  (`data-table-shell.tsx`). A view never sizes a row; a control inside a cell
  fits it, and its cell trims its padding rather than growing the row
  (the presentation list's number input and drag grip).
- **Tabs sit 16 px above the list's search through `ListTabs`**
  (`app/components/shared/list-tabs.tsx`), never spaced per page.
- **A list keeps the `auto` layout unless it overflows.** One that does
  (several free-text columns) takes `layout="fit"`, a `width` on every column
  and `DataTableTruncatedText` on the long cells, tuned so every header fits at
  1280 px. A `width` is a share of the row, so the weights need not add to 100.
- **A sticky header only on a long list.**

## Cards

- **A card is for a repeated item, a modal, authentication, an empty state or a
  one-off summary**, never the page's structure, and never nested. A `section`
  with a heading separates what needs no box. A card with a title uses
  `CardHeader`, `CardTitle` and `CardDescription`.

## Interface text

- **Spanish, Rioplatense, neutral and operational**: `Ingresá`, `Revisá`,
  `Completá`; no marketing tone.
- **A button names a verb and, where it helps, its object**: `Registrar pago`,
  `Publicar resultados`.
- **An empty state says why and what to do next; an error says what to
  correct**, with a generic message only as a fallback.
- **The admin uses [GLOSSARY.md](../../GLOSSARY.md)'s terms**, the portal no
  jargon that does not help; inside a sentence they are lowercase
  (`Nuevo bailarín`).
