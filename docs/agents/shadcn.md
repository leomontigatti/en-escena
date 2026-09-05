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

`dialog.tsx`'s `useLayerAbovePress` is the only one that is load-bearing rather
than cosmetic: it stops a `Select` closing its parent dialog when the press that
dismissed the select lands on the overlay (#708). The comment in the file
explains the mechanism. Deleting it reopens the bug.

## Upstream exports we deliberately do not carry

`pnpm check:fallow` gates unused exports, and the style guide says not to install
a component without a concrete use. Together they mean a component file here is
allowed to be a _subset_ of upstream. These exist upstream and are absent on
purpose, because nothing consumes them:

- `popover.tsx`: `PopoverAnchor`, `PopoverHeader`, `PopoverTitle`,
  `PopoverDescription`
- `badge.tsx`: `badgeVariants`
- `tabs.tsx`: `tabsListVariants`
- `calendar.tsx`: `CalendarDayButton`

Add each one back in the same change as its first consumer, not ahead of it —
adding them speculatively fails the commit hook.
