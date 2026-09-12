# Drag-and-drop row reordering on `ServerDataTable`: which library, keyboard/touch support, server persistence

> Research for [#910](https://github.com/leomontigatti/en-escena/issues/910), a sub-issue of the
> `wayfinder:research` map [#907](https://github.com/leomontigatti/en-escena/issues/907), decision 7
> (drag-and-drop reordering of rows in `ServerDataTable`). Against primary sources: the candidate
> libraries' own repos/npm registry/changelogs, TanStack's `row-dnd` example, and shadcn's
> `dashboard-01` block. No dependency for this exists in `package.json` yet.

## Question

`ServerDataTable` is built on `@tanstack/react-table` v8.21, base-ui/radix + shadcn `Table`
primitives, Tailwind 4, React Router 7 framework mode (SSR). Which drag-and-drop library should
back row reordering, given: maintenance state as of 2026-09, bundle size, SSR safety, keyboard
reordering and screen-reader announcements, touch support, and whether it composes with
TanStack's row model without fighting `<tbody>` rendering — plus a server persistence pattern
(optimistic reorder + fetcher `POST`, vs. posting the whole order) and a failed-save story.

## Repo facts observed

- `package.json`: `@tanstack/react-table` `^8.21.3`, `react` / `react-dom` `^19.2.6`, `react-router`
  `^7.11.0`, `@base-ui/react` `^1.5.0`, `radix-ui` `^1.6.7`, `tailwindcss` `^4.1.11`, `shadcn`
  `^4.19.1`. No `@dnd-kit/*` or `@atlaskit/*` package present.
- The shared table is split across three files:
  - `app/components/shared/data-table-core.tsx` — column/state helpers only (`createDataTableColumns`,
    `useDataTableRowSelection`, filter/sort state hooks). No rendering.
  - `app/components/shared/data-table-shell.tsx` — the actual render: `<Table>` (shadcn) wraps
    `<TableHeader>` built from `getHeaderGroups()` and a `DataTableBody` that renders `<TableBody>`
    around `visibleRows = table.getRowModel().rows`, one `<TableRow key={row.id}>` per row via
    `DataTableBodyRow`, cells via `flexRender`. `DataTableBodyRow` already accepts a
    `getRowProps?.(row.original)` spread onto `<TableRow>` — a ready seam for
    `data-dragging`/`ref`/`style` without touching the row-rendering loop itself.
  - `app/components/shared/server-data-table.tsx` — the fetcher/URL-state orchestration
    (`useDataTableRowSelection`, faceted filters, pagination); no direct table markup.
- Row selection is already handled as an optional, controllable hook (`useDataTableRowSelection`)
  fed into `DataTableBody`, i.e. the codebase already has a precedent for adding a table capability
  via a prop/hook pair rather than forking the shell.

## Findings

### A. `@dnd-kit` — legacy (`master` branch, 6.x/9.x/10.x) vs. new (`main` branch, 0.x)

- **Versions (npm, verified 2026-09-12)**: legacy `@dnd-kit/core@6.3.1` (2024-12-05),
  `@dnd-kit/sortable@10.0.0`, `@dnd-kit/utilities@3.2.2`, `@dnd-kit/modifiers@9.0.0` — all on the
  repo's `master` branch, last commit 2024-12-05, 86 open issues / 40 open PRs, 17.6k stars. New
  stack `@dnd-kit/react@0.5.0` (2026-06-11) + `/dom`, `/abstract`, `/helpers`, on `main`, still 0.x.
- **Maintenance signal**: the legacy docs banner says "There's a new version of @dnd-kit available.
  We recommend you use the latest version instead," and the maintainer bulk-closed legacy issues in
  Feb 2026 citing a "major rewrite" (e.g. #926, #1511). No source calls legacy "deprecated" — it is
  frozen but functional, and it is exactly what TanStack's own v8 example and shadcn's
  `dashboard-01` block ship today (see §B). The new stack is pre-1.0 with breaking minors
  (0.4.0 event-type redesign, 0.5.0, both in 2026) and an open confirmed bug, #2116 (DragDropProvider
  manager destroyed during React Strict Mode replay).
- **Bundle size (esbuild + gzip, local measurement)**: legacy core+sortable+utilities+modifiers ≈
  17.8 kB gzip. New stack (`@dnd-kit/react` incl. `dom`/`abstract`) ≈ 39.1 kB gzip — roughly 2.2×.
- **SSR**: legacy `DndContext` takes an optional `id` prop feeding a module-level unique-id counter
  (`useUniqueId`); without it, SSR/CSR ids mismatch and React warns (tracked in #926). Passing a
  React `useId()` value as that `id` — exactly what shadcn's `dashboard-01` block does
  (`sortableId = React.useId()`) — closes the mismatch. New stack requires `'use client'` and
  `canUseDOM` guards, consistent with a framework that assumes an app-router-style split; React
  Router 7 framework mode does SSR + hydration directly, so the legacy `useId()` fix is the simpler
  fit.
- **Keyboard/a11y**: legacy ships a `KeyboardSensor` by default alongside `PointerSensor`
  (Space/Enter start-end, arrows move, Escape cancel, Tab ends), `sortableKeyboardCoordinates` as
  the coordinate getter, and `DndContext` renders a live region itself (`announcements` /
  `screenReaderInstructions` props, English-only shipped strings — would need Spanish copy since the
  repo's UI-facing language convention is Spanish). New stack also includes a keyboard sensor via
  its Accessibility plugin; no material a11y advantage over legacy for this use case.
- **Touch**: legacy `PointerSensor`/`TouchSensor` with `{distance}` or `{delay, tolerance}`
  activation constraints; docs require `touch-action: none` on the draggable/handle to stop the
  browser from scroll-hijacking the drag. New stack: single `PointerSensor`, default touch delay
  250 ms / tolerance 5.
- **Tables**: legacy `useSortable({id})` returns `setNodeRef`/`transform`/`transition`/`listeners`/
  `attributes` for placement on a `<tr>`, plus `setActivatorNodeRef` for a separate handle element;
  `SortableContext items` must match the rendered row order; `verticalListSortingStrategy` and the
  `restrictToVerticalAxis` modifier constrain movement to the vertical axis. `DragOverlay` for a row
  loses column widths unless cell widths are measured manually (#266) — avoidable by not using
  `DragOverlay` and instead styling the dragged `<tr>` in place (transform + `position: relative` +
  `z-index`), which is what both the TanStack example and shadcn's block do. New stack:
  `useSortable({id, index})` requires an explicit index and drops `SortableContext`.

### B. TanStack `row-dnd` example and shadcn `dashboard-01`

- TanStack's `examples/react/row-dnd` on the **v8 branch** (matching this repo's `^8.21.3`, last
  commit 2026-08-02) depends on `@dnd-kit/core@^6.1.0`, `@dnd-kit/sortable@^8.0.0`,
  `@dnd-kit/modifiers@^7.0.0`, `@dnd-kit/utilities@^3.2.2` — the **legacy** package family, not the
  new `@dnd-kit/react`. (`main`/v9 pins the same legacy family at newer minors: core `^6.3.1`,
  sortable `^10.0.0`, modifiers `^9.0.0`.)
- Its pattern: a `RowDragHandleCell` spreads `attributes`/`listeners` from
  `useSortable({id: rowId})` onto a small `<button>` handle; `DraggableRow` puts `setNodeRef` and
  `style={{ transform: CSS.Transform.toString(transform), transition, opacity, zIndex,
  position: 'relative' }}` on the `<tr>`; `dataIds = useMemo(() => data.map(d => d.userId), [data])`;
  `getRowId: row => row.userId` is called out as **required** ("row indexes will change");
  `handleDragEnd` does `arrayMove(data, dataIds.indexOf(active.id), dataIds.indexOf(over.id))`.
  `<DndContext>` wraps the `<Table>` element (a comment notes it renders `div`s, so it must not
  nest inside `<table>`); `<SortableContext items={dataIds} strategy={verticalListSortingStrategy}>`
  wraps `<TableBody>` only.
- shadcn's `dashboard-01` block (registry, updated 2026-08-06 for v9) uses the identical package
  set. `DragHandle` is a ghost `Button` with an `IconGripVertical` and an sr-only "Drag to reorder"
  label — the accessible name a screen-reader user gets on the handle itself.
  `TableRow` carries `data-dragging={isDragging}` and
  `className="relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80"`, and
  `sortableId = React.useId()` is passed to `<DndContext id={sortableId}>` — the SSR-id fix
  mentioned in §A applied in the field, by the same team whose `Table` primitives this repo already
  vendors.
- TanStack Table itself has no row-ordering feature: row order is just the order of the `data`
  array the table is given.

### C. `@atlaskit/pragmatic-drag-and-drop` and native HTML DnD

- `@atlaskit/pragmatic-drag-and-drop@3.1.0` (2026-08-29, 3.0.0 was breaking on 2026-08-14); repo
  active (last commit 2026-09-12, 12.8k stars) but is a **one-way mirror** of Atlassian's internal
  monorepo — "not to accept code contributions" from outside. Core has no React dependency and is
  small (~7 kB gzip locally for the element adapter), but `react-drop-indicator` peers on
  `@compiled/react` + `@atlaskit/tokens`, i.e. it pulls in Atlassian's own styling stack, and its
  own docs say it is not yet tested against React 19 (this repo is on React 19.2.6).
- Registration is imperative, done in a `useEffect` per draggable — a different integration shape
  than TanStack's declarative row model, and one that fights the table's re-render-on-data-change
  cycle more than `dnd-kit`'s hook-per-row model does.
- **Accessibility is explicitly not automatic**: the docs state it "does not enable accessible
  controls automatically... always provide alternatives to dragging," and recommend *against*
  arrow-key reordering — the suggested pattern is a separate button that opens a menu ("move to
  top", "move up", etc.), i.e. a second UI affordance to build and maintain alongside the drag
  handle, not a drop-in keyboard sensor.
- **Touch**: relies on native HTML drag events. Per caniuse, Firefox for Android does not support
  native drag-and-drop at all, and Firefox additionally requires `dataTransfer.setData` be called in
  `dragstart` (a known Firefox quirk, Bugzilla 725156) or the drag silently fails.
- The library's own table example is flagged "Needs updating" in its docs, and design guidance
  covers only "optimistic update then async persist" — nothing about reverting a failed save.

## Recommendation

Use **legacy `@dnd-kit`** — `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/modifiers` +
`@dnd-kit/utilities` — over both the new `@dnd-kit/react` (0.x) and
`@atlaskit/pragmatic-drag-and-drop`.

Reasoning, weighed against the facts above:

1. **It is what the ecosystem already proved for this exact case.** TanStack's own v8 `row-dnd`
   example and shadcn's `dashboard-01` data-table block — the two closest primary-source analogues
   to `ServerDataTable` (react-table v8 + shadcn `Table`) — both ship this stack, not the new one.
   Following them means the SSR fix (`useId()` into `DndContext id`), the row-in-place drag styling
   (no `DragOverlay` cell-width bug), and the handle/`sortableId` pattern are already field-tested
   against the same primitives this repo vendors.
2. **Keyboard and screen-reader support come built in.** `KeyboardSensor` +
   `sortableKeyboardCoordinates` + the live region `DndContext` renders itself satisfy the
   keyboard/a11y requirement without a second UI affordance. Pragmatic-dnd requires building that
   affordance (a "move to..." menu) separately, and native HTML DnD has no keyboard story at all.
3. **Bundle size and stability favor the frozen legacy line over the pre-1.0 rewrite.** ~17.8 kB
   gzip vs. ~39.1 kB for `@dnd-kit/react`, and the legacy API is frozen (no more breaking minors)
   whereas the new stack had two breaking releases in 2026 and an open, maintainer-confirmed
   Strict Mode bug (#2116). "Frozen" here is a feature, not a risk, given a table component this
   repo intends to keep stable across many features.
4. **Native HTML DnD is ruled out by browser support alone**: Firefox Android does not support it
   (caniuse), which is a hard blocker regardless of the keyboard-affordance gap.

This confirms the expected conclusion.

## Minimal integration sketch

Add reordering to `ServerDataTable` **without forking `data-table-core.tsx`**, following the same
"optional prop/hook" seam already used for row selection (`useDataTableRowSelection`):

- **New dependency**: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/modifiers`,
  `@dnd-kit/utilities`.
- **Drag handle column**: a new leading column (parallel to the existing selection column in
  `data-table-core.tsx`'s `createDataTableColumns`) whose cell renders a ghost `Button` with a grip
  icon; `useSortable({ id: row.id })` supplies `attributes`/`listeners`/`setActivatorNodeRef` for
  that button, and the button's `style` sets `touch-action: none` so touch drags don't get eaten by
  page scroll.
- **Wrapper, not a fork**: an optional `reorder` prop on `DataTableBody`/`data-table-shell.tsx`
  (e.g. `reorder?: { itemIds: string[]; onReorder: (next: string[]) => void }`). When present, the
  shell renders `<DndContext id={useId()} sensors={[MouseSensor, TouchSensor,
  KeyboardSensor({ coordinateGetter: sortableKeyboardCoordinates })]}
  collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={...}>` around
  `<Table>` (outside `<table>`, per the dnd-kit/TanStack comment that `DndContext` renders `div`s),
  and `<SortableContext items={itemIds} strategy={verticalListSortingStrategy}>` around
  `<TableBody>` only. Each row goes through `useSortable` inside `DataTableBodyRow`, and the
  existing `getRowProps` seam already spreads `{ ref, style, ...attributes }` onto `<TableRow>` —
  `style` is `{ transform: CSS.Transform.toString(transform), transition, position: 'relative',
  zIndex: isDragging ? 1 : undefined }`, with `data-dragging={isDragging}` for the dim/elevate
  styling shadcn's block uses. This needs no change to `getRowModel()`/`flexRender` in
  `DataTableBody`, only to what `getRowProps` returns when `reorder` is set — so `data-table-core.tsx`
  itself (the state/column helpers) is untouched, and `server-data-table.tsx` only gains the
  `reorder` config it passes down.
- **`getRowId`**: `ServerDataTable` must set `table.getRowId` (row-table option) to a stable id
  (e.g. the presentation's id) rather than the default row index, per the TanStack example's own
  warning that indexes shift under reordering.
- **Persistence**: on `onDragEnd`, compute the reordered id array locally with `arrayMove` and set
  it as optimistic state immediately (no wait for the server). Fire a `useFetcher().submit({
  presentationId, newOrderNumber }, { method: "POST" })` in the background. If the fetcher's action
  returns an error (`fetcher.data?.error` / non-2xx), revert the optimistic order back to the
  loader's `data` and show a toast (`sonner`, already a dependency) — this repo's
  `docs/agents/form-feedback.md` stay/redirect matrix governs which of those two paths applies.
  Because the row list still comes from the loader, a normal revalidation (React Router
  automatically revalidates after a fetcher submission) reconciles the optimistic order with
  whatever the database actually persisted, so no separate "confirm" round trip is needed. Posting
  only the moved row's id and its new position (rather than the whole order array) keeps the
  payload small and matches the `{ presentationId, newOrderNumber }` shape already implied by the
  domain (`orderNumber` is presentation-level, per prior payment-instructions work in this repo).

## Could not verify

- Whether `restrictToVerticalAxis` combined with virtualization (if `ServerDataTable` ever adopts
  row virtualization) still tracks scroll position correctly — no rows in this repo currently use
  virtualization, so this wasn't checked against dnd-kit's virtualized-list guidance.
- Exact Spanish copy needed for `screenReaderInstructions`/`announcements` — the shipped strings are
  English-only in both dnd-kit versions; translating them is an implementation detail, not
  something the library docs cover.
- Whether React 19's concurrent/Strict Mode double-invoke interacts with legacy `@dnd-kit`'s
  `useUniqueId` counter the same way it does with the new stack's `DragDropProvider` (issue #2116
  is filed against the new stack only, no equivalent report found against legacy — but the
  underlying rendering runtime is the same React 19).
- Real-world bundle size after this repo's own build/tree-shaking pipeline (Vite 7 + React Router
  7 build) — the 17.8 kB/39.1 kB figures are local esbuild-minify-plus-gzip measurements, not this
  repo's actual production bundle.
