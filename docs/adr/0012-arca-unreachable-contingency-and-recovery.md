# ADR-0012: ARCA unreachable contingency, phase classification, and consult-based recovery

**Status**: accepted

Date: 2026-07-30

This ADR records the design decisions taken while closing the contingency gap
that issue #499 surfaced after the invoicing build of #474 (ADR-0011) reached
production. It extends ADR-0011: the emission and annulment semantics fixed
there assumed ARCA answers. This one covers what happens when it does not.

The build handles ARCA **rejecting** a voucher (a response carrying `Errores` /
`Observaciones`). It does not handle ARCA **failing to answer** — timeout,
dropped connection, service down. Today that exception escapes to the generic
error boundary and the operator learns nothing about what happened to an
emission in flight.

## Decisions

### 1. A communication failure is classified by phase, because the risk is asymmetric

Both emission and annulment make two SOAP calls, and losing the connection
during each means something entirely different:

- **`FECompUltimoAutorizado` (lookup)**: only the correlative was queried.
  Nothing was authorized, with certainty. Retrying is free.
- **`FECAESolicitar` (authorization)**: a CAE was requested and we do not know
  whether ARCA granted it. Retrying blind can authorize a **second fiscal
  voucher for the same amount**.

Every ARCA call is therefore wrapped so that a transport failure is caught and
tagged with its phase, instead of propagating untyped. The SDK offers no help
here: `@arcasdk/core` declares no error classes and no error codes, so a
transport failure is indistinguishable from any other `Error` except by where it
was thrown from. Phase is the only reliable discriminator available, and it is
the one that matters.

### 2. Timeouts are imposed at our wrapper, as code constants

`@arcasdk/core@2.0.0` sets no timeout at any layer — not in its SOAP client
options, not in the `soap` dependency underneath, and its `fetch` transport
passes no `AbortSignal`. Its `Arca` constructor exposes no transport
configuration, so there is nothing to configure. Without a timeout of our own, a
socket that opens and never answers leaves the promise pending indefinitely: no
exception is thrown, decision 1 never fires, and the operator waits until a proxy
gives up on them.

We therefore bound each call ourselves, in `ArcaClient`:

- **15s** for lookup. Giving up early is free, and a fast failure gets the
  operator retrying sooner.
- **30s** for authorization. Deliberately generous — WSFEv1 routinely takes
  double-digit seconds under load, and every premature cutoff manufactures the
  ambiguity of decision 3 for a request that would have succeeded.

Both are code constants, injected through `ArcaClient`'s constructor so tests can
shrink them to milliseconds. They are not environment variables: a required one
would break existing deployments, and an optional one is a knob nobody has yet
needed to turn.

Racing a timeout **does not cancel the in-flight request**. The socket stays
open and ARCA may still authorize the voucher after we have stopped waiting.
This is accepted rather than worked around — the SDK gives us no way to plumb an
`AbortSignal` through anyway — but it is the reason a timeout is tracked
separately from a transport failure: decision 3 cannot treat "ARCA does not have
it" as final while the request that would create it is still running.

### 3. Authorization ambiguity is resolved by consulting ARCA, not by asking the operator

`FECompConsultar` — exposed by the SDK as `getVoucherInfo(number, salesPoint,
type)` — answers precisely the question an authorization failure leaves open, and
we always know the number we attempted, since the correlative is derived before
the call. So on an authorization failure the server consults that exact
`ptoVta` / `cbteTipo` / `cbteNro` immediately, in the same request:

- **Voucher found** → it _was_ authorized. Persist the comprobante with the
  returned CAE. What looked like a failure was a successful emission.
- **Not found** (`null`) **after a transport failure** → nothing was authorized.
  Safe to retry.
- **Not found** (`null`) **after a timeout** → still unknown. See below.
- **Consult itself failed** → genuinely unknown. Surface it and gate the retry.

`null` only proves nothing was emitted if the authorization request **finished**.
A transport failure ends it; our own timeout does not — decision 2 says so
explicitly, and the socket stays open. A consult issued milliseconds later can
therefore look straight past a CAE that ARCA is about to grant, and reading that
`null` as "retry freely" would authorize a second fiscal voucher for the same
amount: the exact harm this ADR exists to prevent. Worse, the retry advice is to
wait a few minutes, which is precisely long enough for the in-flight
authorization to land.

This is not a corner case. Decision 2 sets the authorization budget generously
because WSFEv1 is slow under load, which means the timeout fires exactly when
ARCA is slow-but-working — the condition most likely to leave a request in
flight. So `not-emitted` is reserved for transport failures, and a timed-out
authorization with a `null` consult falls through to unresolved. The
discriminator is free: the timeout `Error` is ours, thrown by our own wrapper,
so it is distinguishable by class rather than by parsing a message.

The cost is a blocked retry in cases where usually nothing was emitted. That is
the trade this ADR already made everywhere else: a duplicate fiscal voucher is
worse than friction, and the operator has a way out — verify and acknowledge.

The alternative was to report the ambiguity and tell the operator to verify in
ARCA's portal. Rejected: the operator has no information to contribute and no
judgment to exercise — the answer is deterministic and does not depend on who
asks. Worse, it leaves them holding a fiscal document the system has no row for,
with no way to record it, and the next emission re-derives a correlative that
will collide.

The consult runs at the moment ARCA has just proven unresponsive, so it will
sometimes fail too. That is the third branch, not an argument against trying: in
the common case — a transient blip, ARCA healthy — it answers immediately and the
operator never sees a failure at all.

### 4. A recovered voucher is persisted only if it matches what we submitted

Consulting correlative 47 asks "is there a voucher numbered 47 at this point of
sale of this type", not "is the voucher I tried to emit there". Numbering is not
reserved, and the correlative is derived from `FECompUltimoAutorizado` without
locking, so two concurrent emissions in this app can already select the same
number. Persisting whatever comes back would record a comprobante carrying
someone else's CAE, indistinguishable from a legitimate one forever after.

Recovery therefore requires the consulted voucher's `impTotal` **and** `cbteFch`
to match what was submitted. On mismatch nothing is persisted and the outcome
falls through to unresolved.

The check is not airtight — a coincidental same-amount, same-date voucher would
pass it. With a single point of sale and amounts derived from actual collected
payments, that is not reachable in practice, and the failure mode of being too
strict is landing in the unresolved state, which is safe.

### 5. Unresolved attempts are not persisted

When both the authorization and the consult fail, the attempt leaves no trace:
no row, no log entry with recovery semantics. The state lives in the action
result and dies with the dialog. This preserves the invariant established in
ADR-0011 that a rejection or contingency persists nothing.

This is a deliberate, narrow hole. Decision 3 already resolves the stranded
comprobante at the moment it occurs in the common case; persistence would only
buy something in the residual double failure, where ARCA is down long enough that
both calls fail. And a persisted attempt is **write-only without a reconciliation
surface**: if the operator later confirms in ARCA's portal that the voucher was
authorized, there is no way to record it — this app has no manual comprobante
entry, and cannot invent one without a CAE it never received.

The honest fix for the residual case is a reconcile-from-ARCA feature (consult,
then persist from the consult result, reachable from the comprobante list). That
is its own feature with its own surface, recorded here as out of scope.

### 6. The UI states what was resolved, not which call broke

The contingency type surfaced to the UI keys on the resolved outcome —
`rejected` / `not-emitted` / `unverified` — not on the SOAP phase. The phase is
an input to the server's recovery logic and never reaches the client.

Lookup failure and authorization-failure-then-consult-says-no are different
phases but the _same_ thing to say ("nothing was emitted, retry"). Authorization
failure followed by a successful consult is not a contingency at all — it is a
success. Keying on phase would scatter one user-facing state across two variants
while carrying a distinction the UI never uses.

`unverified` carries the `ptoVta` / `cbteTipo` / `cbteNro` it could not resolve,
because both the re-check affordance and the operator need them.

## Consequences

- The contingency alert becomes shared. It is currently duplicated — once in the
  choreography financial detail's emission dialog, once inline in the comprobante
  detail view — and a three-state union where one state gates a destructive
  submit is a drift hazard with fiscal consequences. It moves to
  `app/lib/comprobantes/`, following the precedent of `app/lib/admin/users/*.tsx`.
  This introduces the first coupling between the finances and comprobantes
  feature trees.
- A comprobante row may now be created from a `FECompConsultar` result rather
  than from a `FECAESolicitar` response, written after an apparent failure. Every
  prior invariant said a contingency persists nothing; decision 3 is the sole
  exception, and it exists because the row corresponds to a fiscal document that
  demonstrably exists at ARCA.
- Recovery success must be reported as such and not as a plain success: the
  emission took up to 45 seconds and appeared to fail, so silently flipping to
  "done" reads as a glitch.
- The work splits in two: the server path (classification, timeouts, recovery,
  validation) ships independently, because a recovered comprobante returns
  through the existing success path and the remaining states map to the existing
  generic error. The UI states, the gate and the re-check land on top.
- **Verified against homologation** on 2026-07-30, by the spike extended in #574.
  Decisions 3 and 4 depend on two properties of `FECompConsultar` that had been
  established by reading the SDK's compiled source only — the automated tests run
  against a mocked billing port and cannot establish either. Both hold against the
  real service: consulting a just-authorized voucher (PtoVta 1, Nro 4, CAE 86310699304854) returned it with `codAutorizacion`, `impTotal` and `cbteFch` all
  matching what was submitted, and consulting a correlative that was never
  authorized returned `null` rather than throwing. Re-run
  `scripts/arca-spike-homo.ts` if the SDK is upgraded.

Extends ADR-0011, which fixed emission and annulment semantics on the assumption
that ARCA answers.
