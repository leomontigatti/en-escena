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

- **Brand marks come from the brand.** The Google sign-in button carries
  Google's own multicolour G, as Google's branding asks of a button that starts
  sign-in; Lucide draws no brand marks.
- **Fonts are bundled, never loaded from a CDN**, so a page looks the same
  offline and in production.
- **Red means an error.** A deduction in a judging sheet reads with a sign in
  the text's own tone, since red would read as an error.

## Viewports

- **Design at 1440 px; everything works down to 1280 px**, a 1366×768 laptop
  or a 1920×1080 one at 150%. At 1280 the admin sidebar leaves about 1000 px:
  that is the budget of a table or a form row. Filters and actions sit above
  the list, never in a side panel.
- **Below 1280, nothing breaks**: content may scroll sideways, never overlap.
  No page `min-width`: it breaks phones and zoom.
- **Phones:** the public program, and the portal screen by screen: one built
  or changed works at 390 px. The admin panel is desktop-only.

- **A panel page without the admin's sidebar takes the `2xl` width**, laid out
  for a laptop.
- **Wide content shrinks inside its row rather than widening it.** The judge's
  `Devolución` field lets its row shrink, since the waveform is wider than a
  phone and would otherwise hold the row wide.

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

- **Blockers with one cause share one alert.** Its title names the money once
  and each label says only what it limits (the schedule capacity, or a modality
  where a deposit blocks only a save that would reprice), since two alerts with
  one title read as a duplicate.
- **Alerts about a record sit above its tabs or card**, never inside a tab or a
  field, so they read the same from either tab.
- **An alert with a multi-line description takes a little top margin**: the
  alert's own row gap suits a one-line notice and crowds a grid.
- **An alert summarises a list of problems with one bullet per distinct
  message**: rows that share a code and a summary collapse into one bullet,
  and a single reason reads as a sentence rather than a one-item list.

## Buttons

- **One primary action per visual zone.** Page and form buttons take the
  default size; `sm` is for a table row or an alert.
- **An icon repeats the label**: `Check` saves, `Trash2` deletes, `Cancelar`
  has none. A delete reads `Eliminar` alone: the page already names the record. A destructive action other than a delete carries its own icon or
  none.
- **An icon-only button has an accessible name and a tooltip**
  (`TooltipIconButton`), unless its icon is obvious: `Trash2`, `X`, `Copy`, a
  drag handle, `Volver`'s chevron. Play, pause and `Download` take one. Text
  cut by truncation keeps a native `title`.

- **A tooltip that is a mark's only explanation is focusable**, since a
  keyboard reader must reach it as a pointer does.

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

- **A client table never shows a loading state.** Its rows are already on the
  page, and nothing the reader does to it waits.
- **A poll's refresh spinner is hidden from screen readers**, which would hear
  it on every poll.
- **Figures that age on screen count by the browser's clock alone.** An update
  that did not get through leaves them aging; nothing is written before the
  page hydrates.
- **A confirmation dialog keeps its copy while it animates out**, so it does not
  change under the user after a save or an archive. The waiver dialog stays mounted
  with `open` off and keeps the confirmation it was opened with.

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

- **A birth date is typed as `dd/mm/aaaa`, not picked from a calendar**, since a
  calendar is too slow for dates decades back. The slashes come by themselves,
  a pasted date may use its own separators, and nothing is checked while typing.
- **A field the server derives keeps its control while a preview runs**: it is
  marked busy and takes the answer in place. While a preview is pending no reason
  shows beside it, so a stale one does not sit next to a changed field.
- **A whole-number input drops anything but digits as it is typed**, rather than
  refusing on commit.
- **A checklist that shrinks below the search threshold drops its search and
  tabs**, with their query; grown back, it starts over.
- **A checklist grows with its rows up to a ceiling, then scrolls inside**,
  fading at its edges while there is more. It has no scrollbar, so its rows stay
  aligned with the fields around it.
- **A `ChoiceCard` toggles as a whole and is as tall as an `Input`**, so a grid
  of them lines up with the fields beside it.
- **A picker's groups carry plural headings, and empty groups drop out.** A
  heading titles a group rather than qualifying each person, so the kind is said
  once; the loader's name order holds within a group.
- **A calendar bounded only by month still offers days past it.** `endMonth`
  bounds the month dropdown, while `latestSelectableDate` bounds the days in the
  last month offered; `startMonth` and `earliestSelectableDate` are the pair at
  the other end.
- **A date field's clear action follows the stored value, not the parsed date**,
  so a malformed value the field refused can still be cleared.
- **A time saved off the steps keeps its minute on offer**, so picking only a new
  hour does not round it to `00`.
- **A money field's dollar sign belongs to the control**: neither its value nor
  its placeholder carries one, and the unit reaches screen readers through a
  visually hidden `En pesos`.
- **A disabled group dims as a whole, and its lock sits outside it at full
  strength**, so the control does not dim twice. A locked date field keeps room
  on the right for its lock icon.
- **A read-only field may show an error for a value derived from others**, though
  nothing in it can be typed. A trailing control keeps its own colour, not the
  field's error colour.
- **The count after a capacity or quota is decoration a screen reader never
  reaches**, so the accessible name or the `sr-only` label spells the count out.
- **A copyable payment identifier renders in one unbroken run, as stored.** A CBU
  is not grouped in fours and does not break mid-number, even at the narrowest
  width.
- **The professional-evaluation switch drops its label in steps as the room
  narrows**, so it never covers the value; its accessible name keeps the whole
  label.
- **A password reveal starts hidden on every mount**, so a remounted form never
  comes back with a password on screen. A locked password keeps the plain input
  and its lock, since there is nothing to reveal.
- **A required text field must hold a letter or a digit**, so a name cannot be
  saved as `.` or `-`.

### File fields

- **A one-line file field is a box that reads as its own value.** Empty, it shows
  the placeholder, which opens the picker; holding a stored file, it is a link
  that opens it, locked or not; empty and locked, it is inert text. Its remove
  button sits beside the box,
  since it acts on the value, and the placeholder is muted while a real file name
  is not.
- **Where a file field sets `replaceRequiresRemoval` (the event documents and the
  seminar form), a stored file must be removed before another can replace it.** The
  field stops offering its picker and refuses drops until the remove button is pressed, so a
  replacement is always two deliberate steps. An uploaded picture or PDF reads as
  a link that opens it, and the field is the whole status: no line under it
  restates it.
- **A compact file field has no helper text**, so the accepted formats and the
  size ceiling stand in for the empty value.
- **On a touch screen a camera field's dropzone only shows what it holds.**
  `Tomar foto` (rear camera) and `Subir imagen` (gallery) under it are the ways in,
  since Android's photo picker offers no camera unless asked. Both open the
  field's own input, so a photo is validated and previewed like a picked file.
- **A player row's download and delete sit at its end**, as a `Devolución`'s do.
  A picked file playing in place of the stored one has nothing to download.

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

- **`PinnedActions` is opaque, where `CardFooter` is translucent**, since the
  fields scroll under it.
- **Both shells draw their main column down to the bottom edge**, so a screen can
  grow to fill the viewport; the choreography detail pins its actions to that
  edge.

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

- **A page with several forms holds one leave guard**, since the router holds one
  blocker at a time. Each form reports its own draft to it, a hidden tab's
  included, and a save that posts to the same page needs no pass.
- **A recorded or deleted take counts as an unsaved change**, though no form
  field carries it. A dialog that never holds one has that flag always false.
- **A save that navigates away is the one exit the guard does not ask about.** It
  sets a pass before it posts, and the pass is handed back after a refused post,
  so the next exit still asks.
- **After an accepted save the form's draft clears, even when the typed value reads
  differently** (`90.0` against `90`), and only the form that saved settles on the
  answer. A refused save keeps what was typed as a draft.
- **A refused save's values survive a tab switch**: the latest refused answer is
  kept, so values refused in one tab are not lost when the reader moves to
  another tab's list.
- **A confirmation's own resubmitted save is not asked about again**: the
  confirmation sets a flag so the save it posts goes through.
- **What a save would clear is decided from the whole form's values**, since it
  depends on which field changed.
- **Esc and the close button are held while a save is in flight**, and an edit
  made during a save is dropped when the save lands.
- **A dialog that holds a pick or a typed password starts empty on every
  opening**, since a pick belongs to one opening.
- **A dialog that holds no typed text asks before it closes only when it holds an
  unsaved change**: a roster checkbox that differs from what is saved counts, so the
  judge dialog asks.

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
- **A `DeleteDialog`'s description says what goes, not that it is for good**:
  its alert already says the action is irreversible.

- **The delete and withdraw dialogs are bounded to the viewport**, with their
  details as the row that scrolls, so the footer stays reachable on a phone in
  landscape (#708). A plain `ConfirmationDialog` sets no bound of its own.
- **A bulk-run dialog is an `AlertDialog` that cannot close while it runs**, since
  closing would hide a run still sending. Its cancel says `Cancelar` before the
  run and `Cerrar` after it, and nothing while it runs.
- **Undoing costs nothing and is one click; the step that cuts a user off asks
  first.** Reactivating a suspended user is one click; suspending closes the
  user's sessions at once, so it asks.
- **Suspending a user has a dialog of its own, shaped like the withdraw dialog.**
  It posts the bare intent through the router form the menu item used, so the
  dialog shows a pending state.

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

- **`Volver` goes back in history when the page before it is the app's**, so a
  list comes back with the filters, search and page it was left on. A page opened
  from a link or a new tab goes to its `to`. It is always a real link to `to`:
  that is what the server renders, what works before hydration, and what a middle
  or modified click opens.
- **The individual detail's back link keeps the list's query**, so `Volver`
  restores the same filtered list.
- **A page whose tabs each hold a list resets the list state when its tab
  changes**, so a search typed in one tab does not filter the next
  (`useResetListQuery`). The change is marked as in-page, so a leave guard over a
  form in another tab does not read it as leaving.
- **A URL tab's default is the absence of its parameter**, when the page opens on
  that default: the URL names only tabs the page does not open on. An `openingValue`
  that differs writes the default's name instead. An unknown value opens as if none were named. A
  switch replaces the history entry and keeps the scroll, and a reset drops the
  page number with the tab.

## Page header

- **Every page opens with its surface's header**: `AdminResourceLayout`, or
  `PortalPageHeader` (`PortalListPage` on a list), a title and always a
  description.
- **A detail page's title is the record's name**, then its number:
  `Luna de Papel # 007` for a choreography (registration number),
  `Luna de Papel · N.º 1` for a presentation (place in the program).
- **The header's action slot** holds the list's create button (`Plus`), the
  `Acciones` menu, or nothing; anything else goes through `headerAction`.

- **Private panel pages title their page with an `h2`**, as the admin's do; public
  forms use an `h1`. The description sits under the title with the admin's
  spacing.
- **A portal list header pairs the event-document downloads with the link that
  creates a record**, in one shared component. It wraps, so a narrow screen stacks
  the pair rather than squeezing their labels.
- **A header's action group never narrows below its own filters**: the
  description wraps before an applied filter, and the add button does not come
  apart from them.

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
- **The record's state is a badge beside the title** (`titleBadge`), the
  component its list row draws, so the two read alike. Only the state the page
  is about (a choreography's readiness on its detail, its money on the
  financial one), never a state that says nothing (an active person), and never
  one the page edits as a field.

- **Lock and block reasons come from one summary that the server's guards also
  use.** The schedule detail reads why its date and time lock and why its delete
  is blocked with the predicates the guards refuse with, so the page refuses
  exactly what the server refuses.
- **A locked field posts its saved value, never a refused draft.** Saving the open
  fields does not blank the locked ones, and the server compares the posted value
  with the stored one.

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
  (the presentation list's number input and drag grip). A cell's badges stay
  on one line.
- **Tabs sit 16 px above the list's search through `ListTabs`**
  (`app/components/shared/list-tabs.tsx`), never spaced per page.
- **A list keeps the `auto` layout unless it overflows.** One that does
  (several free-text columns) takes `layout="fit"`, a `width` on every column
  and `DataTableTruncatedText` on the long cells, tuned so every header fits at
  1280 px. A `width` is a share of the row, so the weights need not add to 100.
- **A sticky header only on a long list.**

- **A tab row scrolls rather than widening the page**; its padding keeps the
  active underline inside the scroll box, and the panel is not a tab stop.
- **A row's name is a link only when the record has a page or a panel to open.**
  A presentation opens its panel, a results row opens its scores once the panel
  has reached the presentation, and a choreography without a number has no
  presentation yet, so its name is plain text.
- **A search matches what the list shows.** On a presentation list that is the
  name, the academy (only where the list shows one) and the number. A search of
  digits matches the order number and the choreography number whole, so `12` does
  not bring `112`, and a row not yet in the order is still found by its choreography
  number. Digits also match inside names and academies.
- **A list's search matches a number with and without its zero padding**: `00042`,
  `042` and `42` all reach the same record.
- **The shared lists' search is accent- and case-insensitive**: typing `bailarin`
  finds `Bailarín`. The in-memory search is the reference; its SQL twin folds a
  fixed set of Spanish and common Latin accents, so a diacritic outside that set
  matches in memory only. The individual choreographies search only lowercases.
- **On a client list, typing filters the rows at once. On a server list the search
  reaches the address bar 300 ms after the reader stops**, so a search leaves one
  history entry. The search box's clear
  button empties it at once, since clearing is a decision and not a pause.
- **A client list pages at ten rows.** A list read or acted on as a whole asks for
  a bigger page, since its rows are already on the page. An administrative list
  shows 50 rows per page, the panel's policy; a portal list sizes its own.
- **A category and its group type read as one pair, `Juvenil · Solo`**, in every
  list and card. A missing second half leaves the first alone, with no trailing
  separator. The modality and classification columns are muted and cut to their
  width.
- **An empty list says one thing everywhere**: nothing exists yet, or the search
  (or the filters, where the list has them) matched none of what exists.
- **Only a search or a filter narrows a list.** Sorting and paging narrow nothing:
  a sort reorders the same rows, and a page past the last one is clamped. A table
  stays up whenever any row exists for the filters, and a list the reader narrowed
  to nothing keeps its table to undo it. The empty state is for a list with nothing
  to show yet.
- **A list's URL writes each facet only when it is off its default.** The
  participation and day facets are not written at all while no event is active,
  since they only narrow a list that has an event.
- **A list with one order and no sortable column drops an `orden` from its URL.**
  Dancers, professors, users and individuals each sort by name alone.

### Table mechanics

- **A header click alternates ascending and descending on a client table.** The
  engine's unsorted third state has no place in the address bar, and landing on it
  would restart the cycle. The flip reads the current direction, so a numeric
  column starts descending.
- **Sorting is by link on a server table and by button on a client table.** The
  server's sort lives in the URL and must be shareable; a column that cannot sort
  renders bare.
- **Leading columns come before the selection checkbox.** The views declare them
  first, so a drag handle or a row number sits left of the checkbox.
- **A row that cannot be selected shows a disabled checkbox**, and select-all skips
  it, so a bulk action only reaches rows it applies to.
- **On a server-paginated table the checkbox reaches the current page only**, since
  the rows are the loader's and nothing else on the client can be selected.
- **A server-paginated list whose selection drives a summary or an action clears
  it whenever its visible rows change** (page, search, facet or sort), since the
  summary would otherwise add up, or the action print, rows no one can see: the
  movements list's cards and the professors list's print do this. A client-paginated
  table keeps its selection across pages.
- **A drag handle draws nothing when the table is not reorderable**, so a view
  hides the handles without changing its columns. The table reports what was
  dropped; the view decides what that means for the order.
- **The toolbar draws nothing when a table has neither a search nor facets**, since
  an empty bar would read as broken.
- **A fit table never wraps a header.** A label longer than its column is cut like a
  long cell; the sort button's negative margin lines the label up with the cells.
- **A value that runs past its column in a fit table is cut with a fading mask**,
  not an ellipsis, which costs no character. The mask is drawn only on a value
  actually cut, and the native `title` keeps the whole value one hover away.
- **Badges that do not fit a fit table fold into a counter whose `title` names
  them**, and the first badge is always kept. In an auto table the column grows
  instead, and nothing folds.
- **The footer count reads `filtered de total` when rows are narrowed**, since the
  reader needs to know the number is not the whole set.
- **When the group button that led to a value list is gone, focus goes to the first
  value**, since no search box can take it.

### Lists' URL and state

- **The address bar owns a list's search, filters, page and order.** The list
  renders the state as it was left, so Back, reload and a shared link show it as
  left. Client-list writes replace the history entry, since pushing one would turn
  Back into a page-by-page rewind. A server list's search replaces it too; its
  sorting, paging and facets push one.
- **A list's applied query is written back in one fixed order, with every default
  left out**, so one list state has one URL. The reader is redirected there only
  when the address holds something else (the order of parameters alone does not
  count). A clamped page, a dropped filter value or a stale parameter comes out
  corrected, and anything the list does not declare is dropped.
- **Stale or invalid list URLs fall back quietly.** An unknown order column takes
  the default order, a page below one is the first page, and two lists on one page
  start clean from each other. A facet at its default does not count as active.
- **Clearing a filter group removes it from the URL**, so a cleared group never
  reaches it. Picking the value a group already holds is not a clear.

## Cards

- **A card is for a repeated item, a modal, authentication, an empty state or a
  one-off summary**, never the page's structure, and never nested. A `section`
  with a heading separates what needs no box. A card with a title uses
  `CardHeader`, `CardTitle` and `CardDescription`.

- **A metric card with a destination is one link**, with the same hover and focus
  as the panel's cards; its `linkLabel` names it for screen readers.
- **On a phone a row's card never cuts its text.** A phone has no hover for the
  `title` a cut cell keeps, so long values wrap instead.

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
- **A duration never rolls minutes over into hours.** File sizes use binary units
  with up to one decimal, drop a trailing `.0`, and saturate at `TB`.
- **Person names are title-cased by Spanish rules**: each word and each hyphenated
  part is capitalised, and the particles `de`, `del`, `la`, `las`, `los` and `y`
  stay lowercase after the first word (`Juan de la Cruz`). A surname may open with
  a particle. A name that is not a person's keeps plain title case.
- **Copy agrees with its count**, so one presentation reads `la presentación
evaluada`, never `las 1 presentación evaluadas`.
- **Copy about a document avoids grammatical gender** where it can, so one sentence
  serves `el comprobante` and `la nota de crédito`. Where a label's gender changes
  a contraction, the label carries it, masculine by default (`el archivo del
contrato`, `el archivo de la autorización`).
- **A warning about a consequence speaks in the conditional**: a deletion warning
  says what each status would become (`quedaría`), not the status badge's label.
- **A count badge reads in the plural**, as the vocabulary does everywhere
  (`Inscripciones`).
- **Deadline dates are shown in UTC**, in the admin prices table's shape, since a
  payment deadline is a date-only value with no time zone. The lead-time warning
  says `venció` or `vence` by comparing the two dates.
- **Payment and choreography numbers share one width of five digits**, so an admin
  reading both numberings on one screen cannot confuse one for the other.
- **A roster kind's noun comes in four forms**: singular, capitalised singular,
  plural and capitalised plural. Further agreement (`ese`, `al`) is written in the
  sentence itself, not by adding a form for each case.
- **A roster duplicate guard says `tu academia` on the portal and `la academia` on
  the panel**, according to the reader's scope.
- **A pending-item label completes the portal's `Falta cargar …` sentence**, so each
  label reads as its end.

## Spreadsheet exports

- **An export that asks for a day or a period starts from a dialog that downloads in
  place**, so the list stays where it is; the choreography's `Exportar bailarines`
  downloads directly. Nothing is chosen beforehand, and the whole-event choice is listed
  first.
- **Each sheet of a workbook carries its own row type**, built with `workbookSheet`,
  so its columns and rows are checked against each other. Every workbook download
  freezes its header row.
- **A spreadsheet export keeps every value in a column of its own**, because a
  spreadsheet is filtered and sorted rather than read top to bottom.
- **Money is written as whole pesos in a number cell with a peso format**, so the
  spreadsheet can add it.
- **A sum over amounts some of which are unknown is itself unknown**, rather than a
  partial sum that reads as complete.
- **A roster person's document number is text**, so it keeps its leading zeros and
  letters, and the birth date is a real date, so the sheet can sort by it and read
  each age.
- **A roster person missing a document keeps their row**, so the gap is visible in
  the export.
- **The dancers export writes an empty document type as `Sin documento`, not a blank
  cell**, since the list leaves the app and a blank cell reads as something someone
  forgot to copy. The period export leaves that cell blank.
- **A period export's file name states the period it holds**, so two downloads never
  look alike. A period in a download address that is not a date is read as no
  date, so a hand-edited address gets the wider file rather than an error page.

## Screen decisions by area

Decisions that belong to one screen, under the area they belong to. A general rule
above reads for every screen; these only say what is particular to one.

### Finance screens

- **A dancer is named `first last` on every financial detail**, through one formatter
  kept with the money formatters, so the administrator's and the academy's details
  name dancers the same way.
- **The movements list draws its amount muted and its direction as the badge.**
  `Disponible` is emphasised and reads `$ 0`, not a dash, on a fully applied payment,
  since zero is an answer there. A refund has no `Disponible`, so its cell is empty.
- **The movements list's metric cards show the event's whole position**, not the
  page's or the filtered rows'. Only an explicit row selection narrows them, and they
  stay at `$ 0` on an event with no movements.
- **A payment's derived `Disponible` card sits above the form, and breaks to two
  columns at `md`, not `sm`**, so it tracks the single-column form beneath it instead
  of leaving an empty cell. The amount is not repeated there, since the `Monto` field
  is a few centimetres below.
- **Finance lists open in a fixed order**: choreographies by number, seminars by date.
  The selectable choreography list pages at 25 rows, since its selection drives one
  deposit that must be read in one reading.
- **The seminar inscriptions list searches the person's and the academy's names**; the
  instructor stays a facet, since an event has too many academies for a facet and
  their names are easier to type than to scroll. The academy reads muted, as context
  for a row about the person and the money.
- **The bulk emission plan's table has two columns, the name and the reason**, framed
  like the list's own tables, so the narrow dialog gives those most of its width.
- **The global comprobantes list has a fixed column order**: `N.°`, `Tipo`, `Academia`,
  `Origen`, `Estado`, `Fecha`, `Importe`. Only `N.°` and `Fecha` sort. It has no CAE
  column and no inline actions, since printing lives on the detail, and it fits its
  seven columns by sharing the row out.
- **A comprobante's type column shows two-letter initials**, because the column is two
  letters wide. The full kind name stays as the badge's `title` and as the full label
  in the facet.
- **`Factura C` is blue and `Nota de crédito C` is yellow**, so an invoice and what
  takes money off it read apart at a glance.

### Judging screens

- **A scoring page names its presentation `Luna de Papel · N.º 1`**, with the list
  row's summary under it, so whoever opened it can check it is the dance they meant.
  Each column's pair joins with a slash and the dots separate the columns; a missing
  submodality is left out, and an empty level says why it is empty (`Sin asignar`,
  `Sin nivel`, `No aplica`).
- **The results and judge lists reuse the presentation list's columns.** The order
  column goes; the number is read-only and sits in the truncation title; the state
  badge gives way to the award and the average; the judge's name is plain text when
  the form is closed.
- **The results actions menu lists the export first, then the publication items**, and
  with neither there is no menu.
- **A judge's scores table is framed like the app's data tables but takes no search,
  sort or pagination**, since a score list has none of them.
- **Each judge's sheet is a table of its own**, so the panel is read one judge at a
  time, not as a grid nobody can scan on a phone at the side of a stage.
- **A score field's label is read out but not shown**, since the column it sits in is
  already headed `Puntaje`.
- **A presentation's scores page holds one leave guard over every judge's draft**, since
  the router holds one blocker at a time. A save posts to the same page and needs no
  pass, and the judge tabs' own actions add no second guard.

### Presentations list

- **The participation list's actions menu is absent when none of its items applies.**
- **The event's days are checkbox cards drawn in place**, not a `ChecklistField`: an
  event has few days, and a checklist's search and `Seleccionados` tab suit only long
  lists. The value stays in date order.
- **The participation list is never paged.** A page link made while it was is
  dropped, the whole day's order is on one screen, since a row can be dragged to any
  place in it, and the count stays against the whole day.
- **The judge-edit selection lives on the rows that the search and filters leave.** A
  row withdrawn since it was chosen is dropped, not counted.
- **The judge dialog's verb agrees with the judges and its preposition with the
  direction**: a judge is assigned _to_ a presentation and taken _off_ one.
- **The choreography number is not a column of this list.** It travels in the name's
  truncation title, so it stays searchable and the administrator can still name the
  choreography to an academy.

### Schedules and seminars

- **A schedule day is labelled by its date alone**, without the time. Tabs and headings
  shorten it to the weekday, which organizers plan by, and the day and month; the year
  is left out because every day of an event shares it.
- **A capacity option is greyed (`disabled`) only when it is full.** No other cause
  greys one out, since a greyed option means only that the place is gone. It is a hint
  rather than a barrier, since occupancy is a racing snapshot, and admin and portal
  build their options in one place so they cannot diverge.
- **A capacity cell shows the capacity, then the places left in muted text**, reading
  destructive when the schedule is full, so a full row can be found while scanning the
  column. The seminar quota cell works the same way.
- **The places left follow a capacity that is still being typed.** Nothing shows while
  the field holds no whole number, or on an unsaved row, since there is no occupancy to
  subtract from. One suffix text keeps the list and the field worded alike.
- **A schedule row spells out two modality badges and counts the rest**, and the count's
  `title` names them, since the count is the only trace of what was folded away.
- **A schedule's date and time are one column**, read and sorted as one instant: two
  columns of one fact, sorted apart, put a 20:00 before a 10:00 of the same day.
- **Seminar kinds are not states**, so both kind badges read neutral and are told apart
  by fill.

### Modalities and prices

- **A submodality added since the last save has no row to hang criteria on**, so its
  criteria button stays in place, disabled, until the modality is saved. This is the
  unsaved-row case of the submit rule, not a state block.
- **The seminar price list shows kind and participant as one column**, since together
  they name the list a row belongs to.

### Events

- **The event detail opens on `Documentos`**, the tab the administration edits today.
  A failed submit brings the tab holding the first error forward. The switch is keyed
  by the submit count, so typing never moves tabs, and a live error such as the
  2000-character cap does not switch them either.

### Grand final

- **A round's batches and audit links sit under their own tabs**, shown only once there
  is one. Once a round has closed, its result is the first tab, and the page opens on it.
- **The audit links run in creation order, and the vote-code batches newest first.**
  An audit link's name opens its QR and address
  again, with a revoke that asks first; a revoked link's name, or a spent one's once its
  round closed, says why it cannot be opened. Revoking stays on the list, and its answer
  is a toast.

### Individuals and roster

- **Linked rows list by academy name, then dancers before professors, then by name.**
- **The `Vínculo` facet lists the link states in the order an individual goes through
  them**: unlinked, pending, linked.
- **A dancer or professor list offers its day filter only with a selected event**,
  since without one there are no days to offer.
- **In the status filter only `Archivado` reads as a badge**, because `Todos` is not a
  status of any row.

### Portal screens

- **The portal's choreography list opens on what is going to be performed.** Its pin sits
  on `Estado`, the group that offers `Retirada`, so picking any answer there, withdrawn
  included, lifts it and the academy reaches its withdrawn choreographies.
- **The creation wizard's pickers offer the academy's active people**, since no roster
  exists yet, sorted case-insensitively as the list modules sort.
- **Each finance tab keeps its own table state, one key per tab**, and opens sorted:
  seminars by their moment, choreographies by number, as every list of that kind does.
- **A judge who never scored leaves no card**, so the page says so in place of a blank
  page. A disqualification has its own alert above, so the judges' cards do not repeat
  it, and the page's pointer to the judges' feedback is said only when a judge is below.
- **The academy's empty states are told apart by cause**: no active event; no published
  order yet, told when the numbers can be read rather than that they exist; a published
  event with no choreography of the academy; and results out with none of its
  presentations among them.
- **A results row on a phone ends its card on the award**, so a scan down the cards ends
  each one on it.
- **The seminar removal dialog holds only a pick from the roster**, so closing it never
  asks.
- **The seminar gallery cards clip their hover zoom with the image band's own overflow**,
  and pin the footer to the bottom so every card in a row measures the same.
- **The individual's `Coreografías` keeps the portal `Resultados` columns in a table**
  fitted at 1280 px. The name opens the rest in a dialog; on a phone each row is a card
  that holds it all. Where the individual has a certificate, the dialog and the card end
  on `Descargar certificado`.

### Program

- **The program's columns follow the participation list's order**: the number, who
  dances, then what the order groups by, minus the columns this surface lacks. Each
  printed row stays one line, cut where a name does not fit.
- **The program's name column takes the width the state column held before it left the
  academy's page**: on that page, 28 with a level column, 37 without. A list that shows
  the academy column takes 19.
- **On a phone a program row is a card with its number leading.** An evaluated card, on
  the public program's day being danced, fades all but its number, which becomes a green
  badge. A withdrawn card fades the same way, with its number in a muted badge and a minus.
