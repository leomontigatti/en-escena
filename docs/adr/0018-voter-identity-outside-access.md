# ADR-0018: A voter is not a user, and the Gran final is not an award

**Status**: proposed

Date: 2026-10-07

The `grandFinal` (CONTEXT.md) lets the public vote for a `finalist` academy
once per `votingRound`, either anonymously with a one-time `voteCode` or signed
in with Google (Meta when its review clears). Thousands of people will sign in
for one tap on one evening and never return. We decided that a **`voter` lives
outside the access domain**: its own table keyed by provider and provider
subject, its own short-lived signed cookie, and an OAuth exchange done by a
small module of its own. It is never a `user`, gets no role, is never listed
under `Usuarios`, cannot be suspended, and an email it shares with an `academy`
account links nothing. We also decided that the Gran final is **a ranking of
academies beside `award`, not a new award value**: `award` stays the single
recognition of a `presentation`, with no position and no tie, and the glossary
entry says so.

## Considered Options

- **Voters as Better Auth users with a `voter` role.** Rejected: every voter
  would get a database session and a row among the real accounts, the admin
  users list would fill with strangers, every guard that enumerates roles would
  need a "not a voter" clause, and Better Auth's same-email handling would
  either merge a voter into an academy account or refuse the sign-in. The
  access domain (`user`, roles, suspension, `sessionInvalidBefore`) is about
  people who operate the product; a voter operates nothing.
- **Reusing Better Auth's `socialProviders` for the exchange but writing to a
  separate table from a hook.** Rejected: the provider flow still creates the
  `user` and `account` rows before any hook runs, so the separation would be
  cosmetic.
- **A fifth `award` value, "Premio del público".** Rejected: `award` is read
  off a presentation's average and compares nothing; a public vote ranks
  academies against each other, has a tie rule and a second round, and is
  published separately. Folding it into `award` would break every surface that
  reads awards off averages.

## Consequences

- The voter module has a two-call interface, start sign-in and finish sign-in,
  and the deletion test passes: remove it and the vote flow is gone, nothing
  else notices.
- Abuse is bounded by identities, not people: one Google account is one vote
  per round, and a person with several accounts has several votes. Accepted.
- A `voteCode` needs no identity at all; it is consumed by the vote it casts.
- Adding Meta later is a second adapter at the same seam, not a change to the
  access domain. Meta's own requirements (Live mode, Business Verification,
  data-deletion URL) are the gate, not code.
- Nothing about a voter is personal data the organization needs: the subject
  id and a hashed email are enough to enforce one vote per identity.
