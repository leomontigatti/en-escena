# Form feedback and redirection

The single convention for feedback (success/error toasts) and redirection in form
`action`s across En Escena. It answers #201 ("do we need the query param in the URL
to show a toast?") and is the durable reference for PRD #409.

Base rule for any new form: **first decide whether the current view still makes
sense after the submit**. That determines whether you stay or redirect, and by which
medium the message travels. Do not re-derive the decision form by form: look the case
up in the matrix below.

## Why "staying" is the default

In React Router, an `action` that **returns without a `redirect`** automatically
revalidates the `loader`s of the active routes. "Rebuilding what changed" (the list
with the new record, the detail with the saved data) is free: no navigation is needed
for the UI to reflect the mutation.

That makes redirecting "just to show a toast" an antipattern. Before this PRD, most
creates/edits redirected to the same view with `?notificacion=<key>` in the URL solely
to carry the message. That produced unnecessary navigations, momentarily dirtied the
URL and forced a global `useEffect` (`RouteToasts` in `root.tsx`) that parsed and
cleaned the param.

We redirect **only when the current view stops existing or stops making sense**, not
to show feedback.

## Behavior matrix

| Case                                   | Redirects?                                                      | Toast transport                         |
| -------------------------------------- | --------------------------------------------------------------- | --------------------------------------- |
| Create/edit via dialog (over a list)   | No                                                              | Direct from `actionData`/`fetcher.data` |
| Edit in a dedicated form (detail view) | No                                                              | Direct from `actionData`                |
| Delete inline from a list              | No                                                              | Direct from `fetcher.data`              |
| Delete from a detail view              | Yes → to the list                                               | Flash session                           |
| Create in a dedicated route            | Yes → to the new resource's detail (or the list if none exists) | Flash session                           |

Notes on the matrix:

- **The first three cases "stay":** they return `{ status: "success", message }`
  (or `{ status: "error", message, fieldErrors, values }` on a validation failure),
  the `loader` revalidates and the UI is rebuilt in place. A validation error leaves
  the user where they were, preserving what they had entered.
- **The last two "redirect"** because after the submit the originating view no longer
  makes sense: a resource deleted from its own detail no longer exists, and a dedicated
  creation route is not a place to stay (there are no bulk-entry flows, so creating an
  internal user does **not** return to an empty form: it goes to the new record's
  detail).
- **There is no "stay-and-reset" exception.** Every dedicated create aligns to the same
  destination (the new record's detail, or its list).

## Two transports: flash session vs. direct `actionData`

The **message catalog** (stable keys, success/error/info/warning variants,
anti-duplicate IDs) stays centralized and its source is shared between both flows.
What changes is how the message reaches the client.

### Direct from `actionData` (the cases that stay)

The `action` returns `{ status, message }`; the route passes that object through
`useServerActionToast` (`app/lib/shared/toasts.ts`), which fires the toast with
`showToastMessage`. See prior art in `features/portal/profile/action.test.ts`
(the branch returning `data({ status: "success", ... })`). The toast's stable `id` is
passed to Sonner so a re-render does not stack duplicates.

This is the pattern for create/edit via dialog, edit in a detail view and inline
delete. It touches neither the URL nor the session.

### Flash session (the cases that redirect)

When the `action` **does** redirect, the message cannot travel in `actionData` (the
response is a `redirect`, not a data object). It travels through a **flash session**:
a single-use cookie the `action` attaches to the `redirect` response, which the target
route's `loader`/root **reads-and-clears** (one-time) to fire the toast. Because it is
consumed on the first read, the toast appears exactly once and does not reappear on
reload or back-navigation.

This is React Router's idiomatic pattern. The project already has a session (Supabase
Auth / cookies, see `app/lib/auth/supabase-auth-ssr.server.ts`), so the flash session
helper reuses that infrastructure instead of introducing a new session. The helper is
a single module in `app/lib/shared` (see #411); do not reinvent the mechanism per
feature.

**Answer to #201:** the query param is **not** needed for edit-in-place (most cases);
for real redirects the correct transport is the flash session, **not** a URL param.
The URL must never show a technical notification parameter.

### Feedback transport

The only transport for a message across a `redirect` is the **flash session**
(`app/lib/shared/flash-notification.server.ts`). The `?notificacion=` query param and
the `RouteToasts` reader in `root.tsx` no longer exist: they were removed in the
contract ticket (#416). The shared catalog of messages/variants with stable IDs lives
in `app/lib/shared/notification-toasts.ts` and feeds both the flash flow and the direct
`actionData` one. For a new form: use the flash session (redirect) or direct
`actionData` (stay), never a URL param.

## Outside the matrix: auth flows

Authentication flows do **not** follow this matrix and do **not** migrate to the flash
session:

- Auth redirects cross a boundary where session **cookies are cleared** (logout and
  expiry destroy the session), so a session flash would not survive.
- Some params carry **real routing state**, not just the message (`redirectTo`,
  `recuperacion` as a loader mode).

That is why auth uses **its own query params**, translated to a toast in `ingresar.tsx`
(`getLoginNotice` / `useLoginNoticeToast`, catalog in
`app/lib/auth/access-form.shared.ts`):

- `motivo=expirada|continuar` — expired session or "sign in to continue" (produced by
  `access-redirects.server.ts`, which also clears the `sb-` cookies).
- `sesion=cerrada` — logout (`salir.tsx`).
- `recuperacion=ok` — password change completed (`cambiar-contrasena.tsx`).

There the query param is the right tool. "Invalid link" errors (invitation/recovery
with an invalid token, email confirmation error) are shown as an inline static page,
without a toast, and are likewise outside the submit matrix.

## What to test

The observable seam is the **`action`'s decision**, not that Sonner paints the toast:

- Cases that stay → the `action` returns `{ status, message }` **without** a `redirect`.
- Cases that redirect → the `action` throws a `redirect` carrying the flash message.

Test that in the handler's `*.server.db.test.ts` / `action.test.ts` (prior art:
`features/portal/profile/`, `features/portal/dancers/detail/`,
`features/portal/professors/list/`). The flash session helper is tested in isolation:
setting a message produces a `redirect` that carries it; reading it consumes it exactly
once (the second read returns nothing).
