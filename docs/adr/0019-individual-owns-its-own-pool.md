# ADR-0019: An individual owns its inscriptions and money the way an academy does

**Status**: accepted

Date: 2026-10-14

Issue #199 asks for a person to sign up on their own, register into seminars and
read their own choreographies, scores and awards. Every `inscription`, `payment`,
`paymentAllocation`, `comprobante` and the `Saldo disponible` key on the
academy, and a seminar inscription needs a roster person an academy loaded. We
decided that an **`individual`** (`Particular`) is **a participating entity of
its own kind that owns its inscriptions, payments and comprobantes through the
same owner the academy's finances already use**, with a roster of exactly one
person: itself. It is a new `user` permission, not a `dancer`: the roster term
keeps meaning "a person an academy loaded".

## Considered Options

- **Generalize finances to a polymorphic owner** (academy or individual on every
  money table). Rejected: it reshapes the model ADR-0009 and ADR-0014 settled,
  touches every allocation, discount and comprobante path, and buys nothing an
  owner kind does not.
- **Individuals do not pay through the product**, administration records their
  money against some academy. Rejected: their deposits and comprobantes would be
  another entity's, and the seminar quota rule (covering the deposit keeps the
  place) would have no owner to read.
- **A user kind named `bailarín`.** Rejected: `dancer` is already the academy's
  roster person, and professors take seminars too.

## Consequences

- Everything that enumerates academies (lists, reports, `Gran final`
  eligibility, the delete-an-empty-academy rule, `academyDataStatus`) must say
  whether an individual counts; the default is that it does not.
- One account is one person and one document, held by an adult; a guardian opens
  one per child. Several people per account is a later decision.
- Reading another academy's rows through the individual's document is a privacy
  boundary, since results are readable only after login: the link takes effect
  only after administration confirms it against a photo of the individual's
  document, and only matches the same normalized number. This is not dancer
  verification: that one exists to place a dancer in a category by age, and an
  individual is never placed through its own account, so it has no `Verificado`
  state. A change of document clears the confirmation; until confirmed, the
  individual reads only what it registered itself.
- The link is worked out on every read, never stored, so an academy deleting,
  archiving or renumbering the row is seen at once. The academy never sees the
  individual's account; it sees only the seminar inscriptions the individual
  holds while the link matches one of its active rows.
- The individual registers into seminars only, never into choreographies; that
  would be its own decision. Its seminar inscription names the individual itself,
  a third option beside `dancer` and `professor`, because an individual may be
  neither.
- An individual is `Participando` when its confirmed link reaches a participant
  row in any academy, so it pays the participant price; without a confirmed link
  it pays the other one. Academies keep the per-row rule.
- The same person cannot hold an inscription in one seminar from both sides: the
  individual is refused when a linked academy row already holds one, and the
  academy when the individual does (`Ya está inscripto como particular`). The
  academy sees the individual's inscription read-only, with a `Particular`
  badge, and in its finances the way a `waivedInscription` reads: `$0`, outside
  its totals, its `Saldo disponible` and the payment presets. The individual is
  told on registering that its academy will see it.
- The individual's money works as an academy's: administration records and
  allocates its payments, its comprobantes carry its name and document, and its
  area reads a financial summary. `Descuento por bailarín` does not apply.
- Sign-up is the public registration with a choice of kind first, one email per
  user. The individual lands in an area of its own, not the `Portal de
academias`, and reads the active event only, results under the same
  publication rule as the academy. Administration confirms links from a
  `Particulares` section that audit reads.
- Certificates are a separate concept and a separate issue.
- Prerequisites, in order: one owner for the permission vocabulary (#740), for
  the access state (#715) and for the identity document (#735), then the roster
  person kind (#1479) before the seminar half.
