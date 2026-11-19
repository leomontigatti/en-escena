# Stack gotchas

Behaviour of the framework, libraries and browsers that the code works around or depends on, grouped by library, with what the app does about each.
It exists so the TanStack Router and Cloudflare Workers migration keeps these facts, since the comments that record them sit in route and component files that the migration rewrites.

Repo rules that follow from them are in [coding-standards.md](coding-standards.md).

## React

- A closure keeps the values of the render that created it. Timers, debounces and live ticks that need the current value read it through a ref. The app does this for the judge's take, the live day's minute and the search debounce.
- React attaches `wheel` listeners passively, so `preventDefault` needs a native listener. The banner editor's zoom adds one to keep the dialog from scrolling.
- A `useState` initialiser runs only on mount, and changing a `key` remounts the element and resets its state. The app seeds a dialog's price pick once and keys tabs, forms and file inputs by the value they belong to.
- When a keystroke's value is rewritten (normalised) before it is set, the caret can jump to the end. The app puts the caret back after a keystroke it rewrites.
- Uncontrolled state updaters chain through React, but a controlled prop catches up only on the next render. A loop of updates over controlled state therefore chains through a ref.
- `useId` gives the same id on server and client. The app uses it for the drag context, which keeps the table hydratable.
- Events from a React portal bubble through the React tree, so a submit from a dialog portalled out of a form reaches that form's handler. The app stops it there.
- A server-rendered `<audio>` may fire `loadedmetadata` before React hydrates. The audio component reads the element's state on mount as well as listening for the event.

## React Router

- A failed data request is wrapped in a message that hides its cause, which is kept in `cause`. The app's error report keeps the cause headlines. A navigation whose data request fails calls `onError` once per boundary that holds the error, so the report de-duplicates per error.
- `fetcher.submit` silently ignores the navigation-only options (`replace`, `state`, `navigate`, `fetcherKey`, `viewTransition`). The app's shared submit options are narrowed to `encType` and `method` to match.
- The hooks `useFormAction`, `useSubmit` and `useNavigation` throw synchronously when their context is missing: outside a router, and `useNavigation` also inside a non-data router such as the memory router the render tests use. The app wraps each one in a `try`. oxlint 1.83 reads a hook inside `try` as a conditional call, so each call carries its own suppression rather than the rule being turned off for the file.
- By default the router re-runs a route's loader after a successful action and on a navigation that changes its parameters or search, so a search-parameter change re-runs it. A route narrows that with `shouldRevalidate`.
- `revalidator` reloads root data too, so a poll through it can trade the page for the error boundary when the root load fails. The app's polls go through a fetcher, and a route's `clientLoader` keeps the last data on screen when a reload throws.
- A link set to prefetch starts its GET early, so a link that starts a sign-in would fire the redirect before the press. The app starts sign-in only from a plain form, and a plain visit to the sign-in URL redirects back to the page.
- A native form posts before hydration, and a raw button inside one submits without the client. The logout item relies on that.
- On a client navigation or a submit, `request.url` is the data request: a `.data` suffix on the path (`/_.data` for a slash path) and the `_routes` and `index` parameters React Router adds. A server module that takes the request alone strips them to recover the URL the reader asked for.
- React Router numbers its history entries in `history.state.idx` from 0, for the entry the tab opened the app on. An index above 0 means an app page is behind the current one.

## Radix UI and shadcn

- Radix positions a control's hidden form input absolutely, so the card that holds it must be `relative`. Otherwise the inputs of rows scrolled out of a long list stretch the page.
- Radix moves focus into a popover or dialog when it opens. A combobox's search input exists only while its popup is open, so the app sends the focus to the trigger on open instead.
- Radix tooltips open on focus, and focus returns to a trigger when its picker closes. The app holds the filter picker's tooltip shut until the pointer next enters the button.
- A closed dialog's content is removed when its exit animation ends. The app keeps the dialog mounted with `open` off so its content survives the animation.
- A press outside an open popup counts as outside the dialog that holds it, unless the popup is portalled into a branch of that dialog's layer. The app's combobox props do that for popups inside a dialog.
- A label is a click on its control. For a popover trigger, activating the label would toggle the popover, and the press that closes an open popover first counts as outside, so the click reopens it. The app focuses the trigger from the label instead.

## Base UI (the combobox behind shadcn's `Combobox`)

- Its clear button empties the chosen value as well as the search. The app keeps the search in its own field, so the clear button empties only the search.
- Grouped items are one entry per section, each carrying its own values. The library hides a section whose options the search has all filtered out, and the app builds the items in that shape.

## TanStack Table (v9)

- A table answers only to the features it is given, and the row models are slots rather than table options. The app registers one feature list for both of its tables.
- The client row models stay on unless a `manual*` flag turns them off. A server table sets them off, since the loader has already searched, sorted and paged the rows.
- On a client-paginated table `autoResetPageIndex` is on by default and resets the page on the table's own changes. The app turns it off because the address bar owns the page reset.
- The engine caches its page model, so a table that is already mounted needs `manualPagination` to stop paging.
- `enableRowSelection` given only a flag keeps the row model out of the per-row path. A predicate costs a call per row, so the app passes one only for tables that can refuse some rows.
- Headers are modelled as groups for stacked headers. The app maps the groups it has, which is one for each table.
- The engine runs the global filter only through columns it can read a string or a number from, so a row-wide matcher has to widen that: the app overrides `getColumnCanGlobalFilter` (a column's `enableGlobalFilter: true` would also do it).
- TanStack's `flexRender` mounts a column's declared function as a component. A view that builds its columns while rendering then hands React a new component on every render, and each cell remounts and loses its state. The app draws a header or a cell by calling its function from one stable component instead.

## Better Auth

- A provider's refusal is thrown as the response body the library parsed: a plain object that a log prints as `[object Object]`. Google's body holds an OAuth error code and a description only, no user data.
- A missing credential and a wrong password return the same error code. A user who came over with no password yet is therefore found with a separate query, run only after a sign-in has failed.
- The React client calls the `/api/auth/*` catch-all on the same origin, so it sets no base URL. The admin plugin takes the server's roles, so the client's permission checks agree with what the server allows.

## ARCA SDK (`@arcasdk/core`)

- The SDK does not re-export its voucher type from the package root. The app derives the shape from the parameter of `createVoucher`, which is the `FECAESolicitar` payload.
- The SDK's DTOs use `Code` and `Msg` in some places (the WSFEv1 errors) and `code` and `msg` in others (the errors of `FECompUltimoAutorizado`, already mapped). The app normalises both to one shape.
- The app's port to WSFEv1 is a minimal surface. In production, `arca.electronicBillingService` fulfils it.

## pdfkit and Montserrat

- pdfkit registers a font rather than embedding all of it, so a PDF carries only the fonts it draws with. The app registers each font file it uses.
- An image given as a data URI is embedded once and reused on every page.
- pdfkit places text from the top of the font's box, so every subset of a font must share the same metrics for lines to sit where the design put them.
- The variable Montserrat font the app styles with cannot be embedded at a chosen weight. The PDF uses the static file for each weight.
- Montserrat comes as one file per Unicode subset, and a PDF draws only the characters its file holds. The app cuts a name into pieces, each drawn in the first subset that covers it, with `latin` first so Spanish text stays one piece. It composes characters first, so an accented letter is one character.

## Spreadsheets (`write-excel-file`)

- A sheet name cannot contain `:`, `\`, `/`, `?`, `*`, `[` or `]`, and is capped at 31 characters. The app replaces the refused characters and caps the name, and a name left empty becomes `Seminario`, so no sheet is left unnamed.
- A phone number converted to a number would lose its leading zeros, so the app writes it as a string cell.

## Browsers: media

- A `MediaRecorder` webm has no duration in its header, so `audio.duration` is `Infinity`. Decoding the take gives its length. A browser without an `AudioContext` still plays the take but reports no duration. The app decodes the take once, and a caller may pass a length for audio that reports none.
- A `MediaRecorder` hands over its data a moment after it is stopped, and by then the session may be gone. The app's save waits for the take, and unmounting mid-take drops it.
- `AudioContext.close()` rejects when the context is already closed or its document is no longer active. The waveform's decoding context closes it with `void`, so that rejection is not caught.
- `play()` rejects on an autoplay-policy block or a decode failure. A tap that starts nothing looks broken, so the rejection has to show an error.
- `preload` sets how much an audio element loads up front. The shared player asks for metadata only; the `Devolución` player asks for the whole file (`auto`). Seeking an audio element asks the server for a byte range, which the storage route answers.
- A decoded image applies its EXIF orientation, so the banner editor sees a picked photo upright.
- A JPEG keeps no transparency. A transparent photo is painted white in the preview and in the banner alike.
- A lazy image loads only once it is about to enter the view. An image that settles before hydration fires no event, so the app reads its `complete` flag on mount.
- A wheel event reports its `deltaY` in pixels, lines or pages, as its `deltaMode` says. The banner zoom counts a line as 16 pixels and a page as 400.
- An object URL keeps its file in memory until it is revoked. The app revokes the URLs it creates and never the stored URL the server owns.

## Browsers: files and forms

- The app's upload field gives the form a storage key, not the file, so the file in its input is one the form library never sees. A file is put into an input through `DataTransfer`, as a pick does. The app restores a kept file that way.
- The app clears a file input by remounting it, so no stale file rides along on the next save. (Browsers also accept setting a file input's value to empty; the app relies on the remount.)
- A `<label>` wrapping a file input opens the picker on a press anywhere inside it.
- A `download` attribute is honoured on a same-origin link, so a stored song saves instead of opening.
- A form that is no longer in the document drops its submission, so a dialog's submit is sent from its button's click while the form is still mounted.
- Some browsers do not take focus on a pointer press. Safari never focuses a button on click, so a clear button hands focus back to its input.
- A page restored from the back-forward cache can come back with its pending state still set. The app resets it on `pageshow`.
- A scrolling region clips anything inside it that tries to escape its box. A popover or a sticky heading placed inside is cut off.
- The app's `Button` turns off pointer events when disabled (`disabled:pointer-events-none`), so a tooltip on a disabled button hangs off a wrapper element that still gets them.
- A view transition morphs the elements that share a name between the old and new page. The app marks only the pair a navigation touches.
- `sessionStorage` can throw: `SecurityError` where storage access is denied, and `QuotaExceededError` when its quota is full. The choreography wizard's saved answers treat both as unavailable storage.

## Browsers: web fonts, text and in-app browsers

- A web font's arrival changes text size without resizing its box, so a `ResizeObserver` misses it. `document.fonts.ready` resolves once the fonts have loaded, and the app measures again then.
- A fallback font's widths differ from the web font's, so a name fitted in the browser is measured only after the web font loads; the print pass waits for it. (PDFs measure with their embedded font on the server.)
- Google refuses sign-in from the Instagram, Facebook and TikTok in-app browsers (`disallowed_useragent`), which identify themselves in the user agent. The app tests Instagram first, since its Android agent can carry Facebook's marks as well.
- On Android, an intent URL hands the page to the phone's own browser. An iPhone has no such address, so the page offers its own menu to leave the in-app browser, and on Android it is the fallback when the app ignores the link.
- Firefox and Safari write only the frames of an error's stack, so the first line of a stack is a frame and not the message. V8 starts the stack with the headline. The app's report takes the first line either way.

## HTTP, Cloudflare and the request object

- A `private` response may be kept by the browser but not by a shared cache, and that includes Cloudflare's. `no-store` keeps a response out of both, which is why the vote page and the admin audit answer send it.
- `Referrer-Policy: no-referrer` stops the page's address from being sent onward. A `noindex` robots tag keeps the page out of search results.
- `Request.formData()` throws a `TypeError` for a body that is not a form, and reading a body twice throws one too.
- A chunked request body has no `Content-Length`, and a declared one can lie.
- Copying a `Headers` object into a new one can merge several `set-cookie` values into one comma-joined value. The app appends its cookie-clearing headers to the response's own headers instead. (Runtime-dependent; check on the target runtime.)

## Node, Vite and Postgres client

- The dev server re-evaluates modules on every edit, so a module-level database client is recreated each time, and each old pool keeps its connections open until the server stops. The app keeps the client on `globalThis`.
- `idle_timeout` (in seconds) closes the connections a `postgres` pool stops using.
- Vite never lets `.env.local` override a key that is already in `process.env`, so a changed `DATABASE_URL` takes effect only after `pnpm dev` restarts.

## JavaScript

- An object literal inherits properties such as `constructor`, so a lookup keyed by a URL value is a `Map`.
- Constructing an `Intl.DateTimeFormat` costs about twenty times a `format` call. The app builds its formatters once, at module load.
- `new Date(text)` reads `03/04` as March 4 in the American order, so Argentine day, month and year text is parsed from its parts.
- A date-only value shaped like a date can still be no date: `2026-13-40` splits into three parts, and `toISOString()` throws on it.
- `"ß".toUpperCase()` is `"SS"`, so a letter whose capital is two characters does not survive a round trip through title case.
- Binary floating point cannot hold decimal steps such as `0.1` exactly. A check against a half-point step therefore runs in tenths.
- `String(value)` can throw for some values, so a report that describes an error must not depend on it.
- A `Record<string, string>` index is typed `string` but returns `undefined` for an unknown key, so a label lookup into one has to check for `undefined`.

## Browsers: print and table layout

- A zero `@page` margin leaves the browser no room for its own header and footer. The printed program's outer table has spacer rows that restore the margin on every page, since a table repeats its `thead` and `tfoot` wherever it breaks.
- The column headers of the printed program sit in a row group, so they print once per schedule rather than once per page.
- A column width that mixes a percentage with a length (`calc(100% - 2.5rem)`) is read as `auto`. One such column makes the browser drop every declared width and spread the table evenly, so the selection column's share of a `fit` table is a plain weight.
