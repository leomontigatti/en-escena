# shadcn/ui in this repo

The visual base is shadcn/ui `radix-nova` on the Radix primitives. What each
component should look like is [`style-guide.md`](./style-guide.md); this file is
about the _tooling_: the vendored skill, how to sync with upstream, and which
local divergences are deliberate.

## The vendored `shadcn` skill

`.agents/skills/shadcn/` holds the official skill from `shadcn-ui/ui`, installed
with `pnpm dlx skills add shadcn/ui` and pinned by content hash in
`skills-lock.json`. `.claude/skills/shadcn` is a symlink into it, so Claude Code
loads it automatically; the `.agents/` layout is what makes the same skill
readable by other agents.

It runs `shadcn info --json` on every activation, so it always sees the real
`components.json` — framework, base library, aliases, installed components. That
is the point of having it: an agent that would otherwise guess at a component's
API reads the resolved config instead.

`skills add shadcn/ui` also offers `migrate-radix-to-base`. It is **deliberately
not installed**: this repo stays on the Radix base (see below), and a skill whose
whole purpose is to migrate off it is a standing invitation to do the wrong
thing. Do not add it back without a decision to switch bases.

To update the skill, re-run `pnpm dlx skills add shadcn/ui` and commit the
changed hash in `skills-lock.json`.

## Radix, not Base UI

`components.json` says `"style": "radix-nova"` and `shadcn info` reports
`base: radix`. Every file in `app/components/ui` imports from `radix-ui` — with
one deliberate exception: `combobox.tsx` imports `@base-ui/react`, because the
shadcn Combobox is built on Base UI's primitive in _both_ bases. Radix has no
combobox. That single import is not the start of a migration.

## Syncing a component with upstream

`shadcn add <name> --diff` shows the drift, but **read its output, do not apply
it**. As of CLI 4.19.1 the generated code rewrites our utils import to
`import { cn } from "cn"` — it treats the last segment of the `utils` alias as a
bare module specifier. Two things follow, and both need undoing by hand:

1. The import must be corrected to `@/lib/shared/utils`.
2. The CLI concludes `cn` is a missing dependency and **installs the unrelated
   `cn` package from npm**. Check `package.json` after any `add` and
   `pnpm remove cn` if it appeared.

More importantly, a blind `--overwrite` destroys the local divergences below.
Port upstream changes by hand, class by class.

To see a clean diff, fetch the registry item directly and normalize it:

```sh
curl -s "https://ui.shadcn.com/r/styles/radix-nova/button.json" \
  | node -e 'JSON.parse(require("fs").readFileSync(0)).files.forEach(f=>process.stdout.write(f.content))' \
  > /tmp/upstream-button.tsx
```

Then strip the leading `"use client"`, rewrite `@/registry/radix-nova/{ui,lib}/*`
to our aliases, run Prettier over it, and diff. Without that normalization every
file looks ~100 lines different for reasons that are purely cosmetic.

Two more upstream artifacts appear in raw registry files and are resolved by the
CLI at write time, not at runtime: `IconPlaceholder` (becomes the `lucide` icon)
and the `cn-*` tokens — `cn-font-heading`, `cn-menu-target`,
`cn-menu-translucent`, `cn-rtl-flip` — which the CLI rewrites from `iconLibrary`,
`menuColor`, `menuAccent` and `rtl` in `components.json`.

## Deliberate divergences from upstream

Do not "fix" these by re-adding the component. They are the reason a blind
overwrite is unsafe.

| Component                                    | Divergence                                                                        |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| `input`, `textarea`, `select`, `input-group` | focus ring uses `brand`, not `ring`                                               |
| `button`                                     | `cursor-pointer`; `link` variant uses `text-brand`                                |
| `progress`                                   | indicator uses `bg-brand`                                                         |
| `badge`, `alert`                             | extra `success` / `info` / `warning` variants, and borders upstream dropped       |
| `avatar`                                     | `data-layout="overlap"` for avatar groups                                         |
| `select`                                     | defaults to `position="popper"`, `align="start"`, explicit `side`                 |
| `sidebar`                                    | wraps its tree in `TooltipProvider`                                               |
| `alert-dialog`                               | `forceMount` passthrough to Portal / Overlay / Content                            |
| `combobox`                                   | `showChevron`, `dismissableLayerBranch`, `positionerClassName`, `portalContainer` |
| `dialog`                                     | `useLayerAbovePress` — see below                                                  |
| all                                          | `font-heading` instead of upstream's `cn-font-heading`                            |

Most of those rows are cosmetic. Two are load-bearing and will break behaviour
if they are reconciled away:

`dialog.tsx`'s `useLayerAbovePress` stops a `Select` closing its parent dialog
when the press that dismissed the select lands on the overlay (#708). The comment
in the file explains the mechanism. Deleting it reopens the bug.

`forceMount` on `dialog.tsx` and `alert-dialog.tsx` has no upstream counterpart
at all — upstream never offers the escape hatch. It arrived for SSR/jsdom test
rendering and is now also what keeps a dialog's `<form>` in the DOM for a submit
button that sits outside it and targets it by `form={id}`. Two details are
deliberate: the prop is typed `true`, not `boolean`, and it is spread as
`{...(forceMount ? { forceMount: true } : {})}` so it is _omitted_ rather than
passed as `false` — Radix treats those differently. It is applied to Portal,
Overlay and Content together, because force-mounting Content alone does nothing
if the Portal unmounts around it. With the prop omitted the component behaves
exactly as upstream does, so this is additive, not a fork. Callers must still
gate rendering themselves (`{open ? <AlertDialogContent forceMount/> : null}`),
since `forceMount` defeats Radix's presence-based unmounting.

## Upstream exports we deliberately do not carry

`pnpm check:fallow` gates unused exports, and the style guide says not to install
a component without a concrete use. Together they mean a component file here is
allowed to expose a _subset_ of what upstream exposes.

Three of these are defined and used inside their own file — they are simply not
re-exported. Publishing them is a one-word change to the `export {}` list, and it
is the export, not the code, that would become the dead symbol fallow rejects:

| Symbol              | Defined at         | Used internally at |
| ------------------- | ------------------ | ------------------ |
| `badgeVariants`     | `badge.tsx:7`      | `badge.tsx:48`     |
| `tabsListVariants`  | `tabs.tsx:25`      | `tabs.tsx:50`      |
| `CalendarDayButton` | `calendar.tsx:187` | `calendar.tsx:169` |

Prefer the composed form over the raw cva export where one exists: `Badge`
supports `asChild`, so `<Badge asChild><Link/></Badge>` covers what
`badgeVariants({ variant })` used to, without exporting the variant function.

Only `popover.tsx` is genuinely missing code: upstream also ships
`PopoverAnchor`, `PopoverHeader`, `PopoverTitle` and `PopoverDescription`.
`PopoverAnchor` re-exports the Radix primitive that lets a popover position
against something other than its trigger; the other three are styled `div`/`p`
wrappers with no logic.

Add any of these in the same change as its first consumer, not ahead of it —
adding them speculatively fails the commit hook.
