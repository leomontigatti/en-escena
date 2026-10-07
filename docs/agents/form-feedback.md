# Form feedback and redirection

The single convention for feedback and redirection in form `action`s across En
Escena: which channel carries each class of message (field error, alert, dialog
or toast), and how a message reaches it. It answers #201 ("do we need the query
param in the URL to show a toast?") and is the durable reference for PRD #409.

Base rule for any new form: **first decide whether the current view still makes
sense after the submit**. That determines whether you stay or redirect, and by which
medium the message travels. Do not re-derive the decision form by form: look the case
up in the matrix below.

This file starts at the submit. What a form submits and when (one save model,
`Guardar`, confirmations) is
[style-guide.md § Editing and saving](style-guide.md#editing-and-saving).

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

## Which channel carries a message

One question decides it: **is there something still on screen that the message
is about?** A field or a form to correct, a lock to work around or a condition to
weigh keeps the message with it, as a field error, an alert or a dialog. A failed
action with nothing to correct, a redirect, or a success is a toast.

| Class                                                                                                                                     | Channel                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Refusal tied to a field (server `fieldErrors`, or a business refusal about one field, such as a document number already held)             | `FieldError` on the field, through `form.setError(name, { type: "server", message })`. No toast.                                                                                                                                          |
| Refusal tied to no field, with the form still on screen                                                                                   | `destructive` `Alert` in the page's `AlertStack`, above the form card; in a dialog, first in the dialog body, above the fields. No toast.                                                                                                 |
| Failure of an action with no form behind it (inline row delete, toggle, reorder, a `fetcher` button)                                      | `destructive` toast: the action failed and there is no form to correct.                                                                                                                                                                   |
| Unexpected failure (the generic `{ status: "error" }` from `recoverableClientAction`, a network drop)                                     | `destructive` toast: nothing the user typed is wrong, so there is nothing to correct.                                                                                                                                                     |
| Message that arrives after a redirect (flash session)                                                                                     | Toast: the view it belonged to is gone, so nothing on screen is left to fix.                                                                                                                                                              |
| Success                                                                                                                                   | Toast. A success that must stay on screen is a `success` `Alert` ([style-guide.md § Alert variants](style-guide.md#alert-variants)).                                                                                                      |
| Duplicate warning (`status: "warning"`)                                                                                                   | The confirmation `AlertDialog` ([A third answer](#a-third-answer-the-duplicate-warning)).                                                                                                                                                 |
| Field locked by the record's state, conditionally or for good                                                                             | `info` `Alert` in the page's `AlertStack`, above the form card, listing every reason and what unlocks it, or saying nothing does. The field renders as a `ReadOnly*Field`. The lock icon alone explains nothing and is never the channel. |
| Action forbidden by the record's state                                                                                                    | `BlockedActionDialog`, opened by the click on a control that stays enabled, with every reason in its `info` `Alert` ([style-guide.md § Detail pages](style-guide.md#detail-pages)).                                                       |
| A condition the user should know before acting, derived or found in the background (recategorised choreographies, registration readiness) | `Alert` in the page's `AlertStack`: `warning` if the user should fix it or will regret going ahead, `info` otherwise.                                                                                                                     |

- **Both server marks clear** when the user edits the affected field (the field
  error) or edits or resubmits the form (the alert), so a stale refusal never
  outlives the values it judged.
- **Copy** says what happened and how to fix it, and names the blocking items
  (the modalities that have choreographies assigned). Generic copy is only the
  fallback.
- **Toasts auto-dismiss** (Sonner's default), so a toast is never the channel for
  something the user has to act on in the form in front of them.

### What is not a block

Three cases get no message:

- **A field read-only by design** on every record of its kind on that surface
  (the academy a choreography belongs to). Its lock icon is enough.
- **A surface read-only because of the role** (an auditor). The role is the
  reason, and an alert on every page would stop being read.
- **A field that does not apply** to this record (a submodality when the
  modality has none) is left out of the form, not rendered locked. Not
  applicable is a different class from blocked: a lock promises a cause, and
  absence promises nothing.

**Block reasons are never filtered by role.** A lock caused by the record's state
shows to everyone who can see the record, auditors included: it describes the
record, not the viewer. Suppressing the alert for a role is a defect.

### Block reasons and result statuses

**Block reasons are a server-built array of `{ code, label }`**: every reason is
listed, none takes precedence, and they render as the alert's list
([style-guide.md § Alert content](style-guide.md#alert-content)) in the field
lock alert or in `BlockedActionDialog`. The `label` is the copy, and the server
builds it because the server owns the rule. A `code` is born consumed: it exists
only if something reads it, a test asserting which reasons fired or a rendering
branch. A code nothing reads is removed, not kept for later.
`DancerEditingBlockReason`, the `reasonCode` in
`app/lib/choreographies/choreography-roster.shared.ts`, is one its callers throw
away; it is consumed or dropped when that code is next touched.

**An action result's `status` names its outcome, not its channel**: an action
answers with `"success"`, `"error"` or `"warning"`. The channel comes from the
message class, any `fieldErrors`, and whether the relevant view is still on
screen ([Which channel carries a message](#which-channel-carries-a-message)).
`ToastVariant` also accepts `info`, which is reserved until a product case
needs it ([style-guide.md § React Hook Form](style-guide.md#react-hook-form)).
A feature that needs to tell its outcomes apart adds a field (`intent`, `kind`, `reason`), never a new status. A status no
reader knows about is silently dropped, which is how the choreography detail's
`"roster-error"` answers were lost (#661). The statuses that predate this rule
(`"contingency"` on the comprobante emission and annulment, `"update-error"`,
`"merge-refused"`, `"moved"`) are exceptions, not a model for a new one.

### Testing and scope

The seam is per feature: a view's interaction test asserts that a refusal reaches
it on the channel the table gives (a field error or an alert, not a toast). The
shared mapping helper is tested once, in its own file. The status contract is a
type, so `pnpm typecheck` holds it and no shared test is needed.

#619 is the reference case. Its page-level block reasons, its `{ code, label }`
shape and its refusal to hide reasons from auditors stand. Its assertion that a
rejection reaches the view as a toast is superseded: a form refusal reaches the
view as a field error or an `AlertStack` alert, and that assertion moves to the
new channel when #517 lands.

#517 builds the one helper that maps `fieldErrors` to `setError` and a no-field
refusal to the alert, absorbing the roster document conflict
(`useRosterRefusalToast`, today a toast with a link and under this table a
field-tied refusal) and the seminars' `setError` loop, and applies it to the
producers. Until it lands, views keep their current channel; a new view follows
the table.

## Behavior matrix

| Case                                   | Redirects?                                               | Toast transport                         |
| -------------------------------------- | -------------------------------------------------------- | --------------------------------------- |
| Create/edit via dialog (over a list)   | No                                                       | Direct from `actionData`/`fetcher.data` |
| Edit in a dedicated form (detail view) | No                                                       | Direct from `actionData`                |
| Delete inline from a list              | No                                                       | Direct from `fetcher.data`              |
| Delete from a detail view              | Yes → to the list                                        | Flash session                           |
| Create in a dedicated route            | Yes → admin: the new resource's detail; portal: the list | Flash session                           |

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
- **A portal create goes back to its list.** An academy registers its roster one
  person after another, often from a phone: the list shows the new record among the
  others and holds the button for the next one, where the detail would be one more
  step back. An admin create keeps going to the new record's detail, or to the list
  when there is no detail.
- **There is no "stay-and-reset" exception.** Every dedicated create aligns to one of
  those two destinations.

## Two transports: flash session vs. direct `actionData`

The **message catalog** (stable keys, success/error/info/warning variants,
anti-duplicate IDs) stays centralized and its source is shared between both flows.
What changes is how the message reaches the client.

### Direct from `actionData` (the cases that stay)

The `action` returns `{ status, message }`. An answer that travels as a toast
goes through `useServerActionToast` (`app/lib/shared/toasts.ts`), which fires it
with `showToastMessage`; a refusal tied to the form goes to the field or the
alert ([Which channel carries a message](#which-channel-carries-a-message)).
See prior art in `features/portal/profile/action.test.ts` (the branch returning
`data({ status: "success", ... })`). The toast's stable `id` is passed to Sonner
so a re-render does not stack duplicates.

This is the pattern for create/edit via dialog, edit in a detail view and inline
delete. It touches neither the URL nor the session.

### Flash session (the cases that redirect)

When the `action` **does** redirect, the message cannot travel in `actionData` (the
response is a `redirect`, not a data object). It travels through a **flash session**:
a single-use cookie the `action` attaches to the `redirect` response, which the target
route's `loader`/root **reads-and-clears** (one-time) to fire the toast. Because it is
consumed on the first read, the toast appears exactly once and does not reappear on
reload or back-navigation.

This is React Router's idiomatic pattern. The project already has a session (Better
Auth / cookies, see `app/lib/auth/access-auth-provider.betterauth.server.ts`), so the
flash session helper reuses that infrastructure instead of introducing a new session.
The helper is a single module in `app/lib/shared` (see #411); do not reinvent the
mechanism per feature.

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

## A third answer: the duplicate warning

Some guards must not refuse. A second dancer with the same name and birth date, a
second choreography with the same name and cast, a second academy with the same
name: each is a duplicate often enough to raise, and a legitimate registration often
enough that turning it away would be the worse bug. Those actions answer with a
**warning** beside their existing `error` / `success` shapes, and one mechanism
carries it (PRD #1090):

- The action returns `{ status: "warning", warning: { kind, matches: [{ id, ... }] } }`
  with the values the user typed, and **writes nothing**. `DuplicateWarning` in
  `app/lib/shared/duplicate-warning.ts` is that type; `kind` says which guard spoke
  (`dancer-name`, `professor-name`, `choreography-cast`, `academy-name`) and each
  match carries the id of the record found plus whatever the copy names it by.
  The answer carries **no `message`**: the matches shown in the dialog are the
  whole copy, so a warning answer never reaches `useServerActionToast` — a route that
  toasts its other answers narrows the warning one out.
- The form keeps the values, and the answer opens a confirmation:
  `DuplicateWarningDialog` (`app/components/shared/duplicate-warning-prompt.tsx`),
  an `AlertDialog` that reads like every other confirmation
  ([style-guide.md § `AlertDialog` vs. `Dialog`](style-guide.md#alertdialog-vs-dialog)):
  a title naming the save the matches interrupted (`¿Guardar el bailarín?`,
  `¿Crear la academia?`), the matches, `Cancelar` back to the form, and
  the title's verb with its icon (`Guardar` with `Check`). Each new answer
  reopens it, so saving again after `Cancelar` asks again. `DuplicateWarningPrompt`
  is the form's version: the verb button and one hidden
  `acknowledgedDuplicateIds` input per match reach the form through the `form`
  attribute, since the dialog renders outside it. A multi-step form (the
  choreography wizard) adds the same field to the form data it rebuilds.
- The re-submit **re-runs the check** (`readAcknowledgedDuplicateIds`,
  `matchesToWarnAbout`). A match that appeared between the two submits was never
  shown to the user, so it warns again — and that second answer carries **every**
  match, the acknowledged ones included, so the next submit covers the whole set.
  Answering with the new match alone would drop the acknowledgement of the others,
  and two matches appearing in turn would warn about each other forever. The server
  is the only party that sees both surfaces and concurrent writes, which is why the
  acknowledgement travels to it rather than being resolved client-side.
- **Nothing is stored** about an acknowledgement: saving the same values again warns
  again.
- **A refusal always wins.** The warning runs after validation and after the hard
  uniqueness pre-checks, so a document number already used by another record of the same roster (dancers with dancers, professors with professors) is a refusal,
  never a warning the user can click past.
- **Known limit:** matching is case-insensitive and whitespace-insensitive but
  **accent-sensitive** (`lower(...)` in SQL, no folding extension installed), so
  `Sofía` and `Sofia` do not match.

The comprobante emission dialog (`app/features/admin/finances/comprobante-emission`)
is the visual precedent for "the server says wait, the user acknowledges, the same
submit is re-enabled"; the difference is only that here the acknowledgement is sent.

The seam to test is the same as the matrix's: the action returns the warning and
performs no write, the acknowledged re-submit performs it, and the form renders the
continue action and includes the ids in the submission.

## Unexpected failures during a submit

The matrix above covers what an `action` **decides**. What it does not decide —
a service throwing, the request failing at the network level — used to reach the
root `ErrorBoundary`, which replaced the whole screen: the navigation, the open
dialog and everything the user had typed, with no toast.

Every route module with an `action` therefore also exports a `clientAction` that
delegates to `recoverableClientAction` (`app/lib/shared/recoverable-client-action.ts`):

```ts
export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}
```

It returns the server result untouched on success. On a throw it logs
`[action:unexpected]` and returns `{ status: "error", message }` with generic
copy, which lands in `actionData` / `fetcher.data` like any other result — so the
view stays mounted and shows a toast. **Deliberate refusals are unaffected:** a
thrown `Response` (a `redirect`, a 403, a 404) is rethrown, so redirects still
navigate and thrown route errors still render the boundary.

Two consequences for a view:

- **Close a dialog on success, not on submit.** A dialog that closes on "the
  fetcher went idle without its own error shape" now closes over an unexpected
  failure too. Key the close on `status === "success"`.
- **Read the generic shape.** A view whose result type is narrower than
  `{ status: "error", message }` — an intent-tagged result, a `status:
"update-error"` variant — has to accept the generic error as well, or the
  failure is silent. `isUnexpectedActionError` is the predicate for that test;
  plain `status === "error"` narrowing is enough only where the result is a
  closed union that already carries a `status`.
- **Mind the fetchers with no toast.** A `useFetcher` that drops anything not
  tagged with its own intent — the roster and modality resolutions of the
  choreography detail — drops the generic error too, and there the user sees
  nothing at all. Handle it before the intent guard, put the message on the
  field, and mark the submission as answered so the effect does not resubmit in
  a loop.
- **A dialog re-opened by the shape of the result needs the intent too.** The
  generic error carries no `values` and no `intent`, so "no `values`" or "not my
  intent" no longer identifies which form failed: the delete dialog of the
  payment detail keys its re-open on the intent that was in flight
  (`shouldOpenPaymentDeleteDialog`), and the dancer detail opens no dialog at
  all for a generic error.

Resource routes with an `action` and no UI (`$`, `api.auth.$`, `salir`) export no
`clientAction`: there is no mounted view to keep, and a returned error result
would have nowhere to go.

A new route with an `action` exports the `clientAction` too — including when it
re-exports the handler (`export { action, loader };`) rather than declaring it,
the shape that hid the three `administracion.usuarios_*` routes from the first
sweep. `app/lib/shared/route-client-action.test.ts` holds the rule over
`app/routes/`, with those three resource routes as its declared exceptions.

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
