# Transactions and Locks

What the database layer relies on when it writes: how transactions refuse, which
reads belong inside them, which locks a write takes and in what order, and the
schema and driver behaviour the code depends on. The **lock orders below are the
contract**: every write path that takes more than one lock keeps the order of its
area, and a new write path takes its locks in the order its neighbours take them
or says why it cannot. The rules a lock protects live in the domain docs, which
this page links rather than repeats: money in [finances.md](../domain/finances.md)
(the pool lock is in "The pool rules"), roster and removal in
[choreographies.md](../domain/choreographies.md), seminars in
[seminars.md](../domain/seminars.md), judging in [judging.md](../domain/judging.md),
the `Gran final`'s voter identity in
[ADR-0018](../adr/0018-voter-identity-outside-access.md). Migrations are in
[migrations.md](migrations.md).

## Transactions

- **A refusal midway throws; it does not return.** Returning `{ ok: false }` from a
  Drizzle transaction callback commits the writes made before it. A refusal raised
  inside a transaction is thrown and turned back into the result the caller expects
  at the boundary: `CobroRefusal` through `runCobro`, the birth-date refusal through
  `applyDancerBirthDateCorrection` and `runDancerWriteWithBirthDateCorrection`. The
  rule for naming it is in [coding-standards.md](../agents/coding-standards.md).
- **Readers take the caller's executor.** A money, status or comprobante reader
  that a transaction depends on takes the executor, so it reads inside that
  transaction. Opening a second connection instead would wait on the transaction's
  own locks, or hold two connections at once. The same reason keeps a pool read out
  of a transaction that already holds one.
- **Reads that need the pool happen before the transaction opens.** The birth-date
  correction reads the event bases first; the bases query takes either the pool or
  the open transaction, and only the reads whose answer must be the transaction's
  use the transaction.
- **A fan-out read is one query.** A transaction is one connection, so a read made
  per row queues on it. The comprobante reader fetches every row's lines in one query.
- **Readings that must agree come from one statement or one instant.** The collection
  export reads its payment rows in one statement, so the payments and the allocations
  drawn from them add up. A detail takes one `now` for all its reads, so a row's
  `Reservada` badge and the places left agree. A result read in two statements is
  redacted by either read's disqualification, so a reinstatement landing between them
  shows nothing the first read still hid.
- **Versions are written past the last one.** A refund's version is its `updatedAt`,
  and every write sets it to at least a millisecond past the previous value, so two
  edits in one millisecond do not read as one version.
- **Writes outside a transaction are compensated by hand.** Internal users are
  created through Better Auth's admin plugin with the email already verified, and the
  real role is assigned afterwards. A rollback deletes the user through the internal
  adapter, since that path has no admin session. Setting a password from the panel
  needs the admin session's headers.

## Lock primitives

- **`FOR UPDATE` on the row a write decides on, before anything reads its state.**
  Allocation, waiver and withdrawal serialise on the inscription row, so a racing
  waiver or withdrawal is either read first or waits. A judge's write and a
  settlement lock the presentation the same way.
- **Several rows are locked in id order**, so two writers over an overlapping set
  cannot each hold one the other waits on. This holds for prices, inscriptions,
  seminars, people, assignments and academies.
- **Only the active rows of a choreography are locked on removal.** A withdrawn row
  locked alongside would deadlock with the retained-deposit release and an academy
  merge.
- **`NO KEY UPDATE` where a foreign key's `KEY SHARE` must still get through.** The
  choreography removal takes its event row this way: it waits for the ordering's lock,
  but an allocation racing it can take the `KEY SHARE` its foreign key to the event
  needs.
- **`FOR SHARE` for a vote.** A vote holds its round and its batch while it commits, so
  a close or a void, which are plain `UPDATE`s and conflict with `FOR SHARE`, waits for
  the votes already counting. A vote that comes behind re-reads and counts nothing.
- **Shared and exclusive list locks.** The choreography price list and the seminar price
  list are each taken shared by the writes that store a price or make an inscription
  active, and exclusive by the price editor. The shared lock means two writers never
  wait on each other; the exclusive one lets the editor's guards see whatever committed
  first. Both are transaction-scoped.
- **Advisory locks are transaction-scoped unless a session lock says so.** The pool
  and the comprobante anchors take `pg_advisory_xact_lock` on a hash of a single key.
  Two keys in an event's own keyspace serve the event locks (readers of a list take
  the event's lock shared, its editor takes it exclusive): a single-key collision
  with a withdrawal that already holds its anchor lock would be a deadlock, so the
  event locks never share a keyspace with them. A hash collision between two single-key
  locks costs one of them a wait, never correctness.
- **Comprobante emission holds a session lock, and fails fast.** It takes the anchor
  with `pg_try_advisory_lock` on a reserved connection and answers `busy` when the unit
  is taken. Waiting would hold that connection for as long as ARCA takes to answer while
  the holder still needs a pooled connection, so enough waiters would starve the pool.
  The roster writes that must not move what an emission is about to document take the
  transaction-scoped form and wait.

## Lock order by write path

Each line is the order the path takes its locks, in the order it takes them. A lock
named as "the pool" is the academy pool of [finances.md](../domain/finances.md)
("The pool rules").

### Finances

- **Money gesture on one choreography inscription** (`Asignar dinero`, `Quitar dinero`,
  the waiver): the inscription row, then, on a gesture that prices, the price row, then
  the pool. The owner is read without a lock and the academy is checked again under the
  locks, so a row that moved away is refused rather than charged.
- **Money gesture on one seminar inscription:** the seminar row, the inscription row,
  the event's seminar price list (shared), then the pool. The seminar's id is read
  before its lock, which is safe because a seminar inscription's seminar never changes.
- **The waiver:** the scope's active inscriptions, `FOR UPDATE`, in id order, before
  it reads whether a row is waived.
- **Threshold charge, choreography (`Pagar seña` / `Pagar saldo`):** the selection's
  active inscriptions in id order, then the picked and stored price rows in order
  (`lockPriceRows`), then the pool. A waiver racing the charge either commits first and
  is read, or waits until the charge has funded.
- **Threshold charge, seminar:** the seminars `FOR UPDATE` in id order, the active seminar
  inscriptions `FOR UPDATE`, the seminar price list (shared), then the pool.
- **Withdrawal that releases money:** the withdrawal stamps the row, then takes the
  academy's pool and unwinds to the retained deposit under it. An unwind that falls
  short throws, so the transaction does not commit as if the money had moved.
- **Academy merge:** both academies' pools in every event, taken in key order, before
  anything else; then the two academy rows `FOR UPDATE` in id order; then the moves. The
  pool locks are sorted, so a merge and a spread over the same pools take them in one
  order. A payment edit or deletion locks only the pool its payment is in, and refuses
  a payment that moved academy while it waited, rather than taking a second pool.
- **Known cycle:** an academy merge racing a withdrawal on the academy it removes can
  deadlock. The withdrawal holds an inscription row and waits for a pool; the merge
  holds the pool and waits for the row. Postgres aborts one of them, and no money
  moves.
- **Comprobante emission:** the anchor's session lock (fail fast) on one reserved
  connection, with every read and the comprobante's insert on that connection, so the
  derivation runs inside the lock. The insert lands before the lock is released.

### Choreographies

- **Choreography price edit or delete:** the event's price list exclusive, then the
  price rows `FOR UPDATE` in id order, then the guards. The guards read which
  inscriptions stored the row and whether a group type has an active one, so they
  see every write that committed first.
- **Price row used by a write:** a candidate price is read under the lock a price edit
  or delete takes first. A preset locks every row it can touch at once, in id order,
  before its loop.
- **Portal registration:** the event's price list (shared), then the schedule's capacity
  lock, then the choreography number. Readiness is read before the transaction and asked
  again under the price-list lock, because a price edit can take away the one part of it
  a registration in flight depends on.
- **Choreography number:** the event's counter row, taken inside the insert transaction,
  after the capacity lock. A cast warning comes before it, so a warning burns no number.
  The counter row is created on first use by whichever writer reaches it first.
- **Admin draft save of a choreography:** the event's price list (shared); the comprobante
  anchor's transaction lock, only when the save changes a classification (a re-synced
  roster can delete an inscription an emission is billing); the choreography row
  `FOR UPDATE`, where the stored fields are checked against what the decision was made
  on; the active inscriptions of the choreography in id order, only when the group type
  changes; then the schedule and capacity locks. Every refusal that reads nothing under
  a lock is decided before the transaction, and the schedule is locked before any row is
  written, so a refusal leaves no piece of the draft behind.
- **Choreography removal:** the event row `NO KEY UPDATE`, the choreography row
  `FOR UPDATE`, its presentation `FOR UPDATE` (a judge's score write locks it too), the
  active inscriptions in id order, and then the delete or the withdrawal.
- **Inscription withdrawal:** the active inscriptions, locked before the evidence is read,
  in the same id order as the removal. An allocation locks the inscription before it
  inserts, so one racing the withdrawal either commits first and is read, or waits and
  is refused once the row is withdrawn.
- **Schedule structural edit, and every path that places a choreography on a schedule:**
  the schedule row `FOR UPDATE`, then the check against the schedule as it stands under
  the lock. No choreography can land between the check and the commit.
- **A capacity move locks the schedule before the capacity.** The reassignment, the
  modality correction and the roster path run the price check first, which reads without
  a lock. Then they lock the schedule row `FOR UPDATE`, check the category against the
  schedule when the caller asks for it, lock the named capacity row `FOR UPDATE`, and only
  then check that the capacity belongs to the schedule and has a place. A capacity from
  another schedule is refused under those locks, never stored. A category change that
  stays on its schedule and slot locks the schedule row alone and checks acceptance, with
  no place counted.
- **Birth-date correction:** runs in the dancer write's transaction, never through the
  pool, since a `FOR UPDATE` outside a transaction guards nothing. It resolves every
  destination before it writes any row. Each destination's schedule is locked and
  counted with the places already granted in the same pass passed in as reserved,
  because the occupancy count cannot yet see them. A choreography that stays on its
  schedule is still locked and asked again before its new category is written.
- **Roster merge:** the two people `FOR UPDATE` in id order, so two merges over the same
  pair lock in the same order.
- **A merge deletes the removed row before the survivor takes its document.** The
  document number is unique within the academy, so the survivor can take it only once the
  removed row is gone.

### Seminars

- **Registration:** the seminar row `FOR UPDATE`, then the event's seminar price list
  (shared), then the cell check and the insert. A price edit that commits first is read;
  one that comes second sees the inscription.
- **Seminar delete:** the seminar row `FOR UPDATE` first, then the inscriptions counted
  under it. The seminar's cascade would otherwise take an inscription that landed between
  the guard and the delete, without ever refusing it.
- **Seminar price create, edit or delete:** the event's seminar price list exclusive, then
  the guards and the row read again under it.
- **Money gestures on a seminar** lock the seminar rows as above. Their quota and their
  refusal order are in [finances.md](../domain/finances.md) and [seminars.md](../domain/seminars.md)
  ("The place").

### Judging and presentations

- **Judge write** (score, `Devolución`, the judge's own edit): the presentation row
  `FOR UPDATE`, then the day and the presentation's state read under it. A withdrawal is
  read in a statement of its own after the lock, so it sees the stamp the withdrawal
  wrote. The take of a `Devolución` is uploaded inside the transaction, and the object it
  replaces is deleted only after commit.
- **Settlement** (disqualification or reinstatement by administration): the presentation
  row locked before its read, and the withdrawal read in its own statement after the lock.
- **Judge assignment edit:** the choreographies first, `NO KEY UPDATE` in id order, which
  waits for a withdrawal and for another edit of the same rows while letting other
  inserts' key checks through. The assignment rows the edit reads are locked as they are
  read, so a judge's score that is saving waits for the removal instead of landing between
  the read and the delete.
- **Automatic ordering, manual move and program visibility:** the event row `FOR UPDATE`,
  which serialises two administrators pressing the action at once. Frozen rows are read
  under that lock, so a score saved meanwhile is seen.
- **Criteria save** of a submodality: the submodality row `FOR UPDATE`, one save at a time.
- **Professional evaluation** from the portal: the choreography's presentations locked
  before the evaluation is read, against a judge's save that locks the presentation it
  scores, so a score that lands first is seen.

### `Gran final`

- **Publish, `Desempate` open, round open, vote-code batch numbering and a finalist pick
  save:** the event row `FOR UPDATE`, so they take turns. A round's open then takes the
  banner rows `FOR SHARE`, so an open and a banner save take turns too. A banner save
  holds its row until commit and deletes the objects it replaced only after; waiting for
  it means the round copies the keys it wrote.
- **A vote:** one `INSERT ... ON CONFLICT DO NOTHING` (see the constraints below), holding
  its round and batch `FOR SHARE` while it commits.
- **A voter's sign-in:** one upsert statement, so two sign-ins of one identity make one
  voter.

## Refusals inside transactions

- **A refusal that depends on a lock is decided under it.** The guard that reads
  referencing rows before the transaction is asked again inside the writing transaction,
  for the edits it refuses, so a registration committed in between is seen.
- **A stored state changed under the lock refuses the save.** The draft save checks the
  choreography's fields under its row lock and refuses a stale decision rather than
  writing one made on the old answer.
- **A refusal of the whole write leaves nothing behind.** A vote's insert takes its round,
  its finalist and its identity from selected rows, so a closed round, an academy the
  round did not copy, an unknown code or a code of another event insert nothing; only
  then is the reason read. A judge's removal reads the scored pairs first, so one scored
  pair refuses itself instead of failing the removal of every other pair.
- **A price that collides with one being saved** is refused by the constraint when the
  pre-check missed it, and the refusal is asked again once the other save commits, so a
  special price still names its schedules.

## Races settled by constraints

- **A vote is decided by the unique index**, never by a read beforehand: a double tap, a
  retry or two phones with one code count once however they interleave.
- **A document number** is refused by its unique index, and the refusal maps to the same
  field error the pre-check gives, so two saves landing together never become a server
  error. The holder's id is absent only when the follow-up read cannot name them.
- **A presentation's order number** is unique and `DEFERRABLE INITIALLY DEFERRED`, so
  renumbering a whole event in place is checked once, at commit.
- **A judge's assignment** that a score references is protected by the score's foreign key
  `restrict`, which the assignment lock waits on.
- **A category or modality delete** is checked first for the referencing rows, and the
  foreign key refuses it if one landed in between. Both paths report the same failure.

## Races settled by a conditional update

- **Revoke, void and close are each one conditional `UPDATE`.** A link revoked twice at
  once, a batch voided twice or a round closed twice keeps the first time, and the second
  reads as already done (`already-revoked`, `already-voided`, `not-open`). Nothing undoes a
  void. A round close names its round, so a close confirmed for round 1 that arrives after
  round 2 opened finds round 1 closed and leaves round 2 open.

## Foreign keys and deletes

- **Cascades.** The category link to modalities cascades. A deleted choreography price
  cascades its schedule links. A user's delete cascades to its academy, sessions, roster
  and payments. The impersonator column cascades rather than nulling, so a live
  impersonation could never quietly become an ordinary session of the user; the admin
  plugin refuses impersonation, so the column stays null.
- **Restricts.** A choreography's category, and a schedule's accepted categories, do not
  cascade: they are checked first and the foreign key refuses the rest. A schedule that a
  price covers cannot be deleted. Seminar inscriptions restrict the roster people, because
  nobody deletes roster people today and a path that did would be refused while
  inscriptions exist.
- **Explicit deletes.** A presentation and its judge assignments do not cascade. Deleting a
  numbered choreography deletes its presentation and its assignments explicitly, in the
  same transaction. The demo seed deletes children first for the same reason.
- **Retired columns.** A price's old schedule column is kept until the schedule links it was
  copied into can be dropped in a contract step. Nothing reads or writes it, and the price
  row type omits it, so no reader takes a tier from it.

## Schema traps

- **A nullable target column.** The choreography target of an allocation is typed non-null
  only inside a query that already restricts it to non-null ids. A reader that does not
  restrict it, such as the operational summary, treats it as nullable.
- **The schedule capacity is nullable.** Presentation and program reads join the
  choreography's own category and schedule columns, never the capacity's, so a nullable
  capacity cannot drop rows.
- **Two counts that agree only by an invariant.** The occupancy counter attributes a
  choreography to one schedule through a coalesce, and the lock counts it against both.
  The two agree only while a choreography's schedule and its capacity's schedule are the
  same schedule, which registration, the roster path and the detail's reassignment keep
  by writing the pair together. A writer that breaks the pair breaks the counter first.
- **A composite key needs a constraint, not an index.** The votes' composite key references
  the round's finalist unique key, so that key is a table constraint, created with its table
  ahead of anything that needs it.
- **Column order is part of an insert from a select.** The vote table's last column was
  added after the table; the insert names the columns in that order, so the order must not
  change.
- **The primary key is shared.** New tables take `uuidPrimaryKey`, a `varchar(255)` holding
  a UUID the application generates, rather than spelling the column out.
- **Enum names carry no `en_escena_` prefix.** The prefix is a `create-t3-app` leftover that
  a repo-wide cleanup removes, so a new enum does not add to it.
- **A deferrable constraint is hand-written.** Drizzle cannot express `DEFERRABLE INITIALLY
DEFERRED`; the migration is edited by hand, and the schema comment says so.
- **ARCA dates and the issuer CUIT are text.** The comprobante date and the CAE expiry are
  `AAAAMMDD` text, as ARCA writes them. The issuer's CUIT is text too: 30717611590 is past
  the range of a 32-bit integer. The service period and the payment due date exist only on
  comprobantes emitted as Concepto 2; a Concepto 1 comprobante carries neither, so they read
  as absent, not as a date.
- **A person can hold two inscription rows in one choreography.** A dancer added again
  after a withdrawal gets a second row, so counting a person's choreographies counts
  distinct choreographies, not rows.

## Drizzle and Postgres behaviour the code depends on

- **Unqualified columns in a single-table select.** Drizzle leaves the columns of a select
  field unqualified when the query has one table, so an `id` inside a subquery binds to the
  subquery's own table. Columns of a nested template are qualified by hand.
- **Aliases render bare.** An alias inside a template renders as its bare name, so a
  subquery's `from` names the table and the alias itself. A subquery column such as
  `first_name` would also match the dancer's column unless it is qualified; a comparison
  that uses an outer column stays outside the subquery, where that column keeps its
  qualifier.
- **A parameter in a select list reads as text.** The kind of a vote is a SQL literal,
  because the enum and integer columns refuse text.
- **A regex escape survives the template literal only doubled.** Written as `'\s+'`, the
  escape cooks to `'s+'` and collapses runs of the letter `s` instead of whitespace.
- **Text equality is accent-sensitive.** No folding extension is installed. Search over
  names is folded with `translate` over a fixed list of accented letters, after NFC
  composition, with `LIKE` patterns escaped so `%` and `_` match literally. The SQL fold
  must match the in-memory fold on every input, which is why the list is fixed: `unaccent`
  would need a migration and an immutable wrapper to be indexable.
- **Error classes are read by SQLSTATE.** The repo refuses only on `unique_violation`
  (23505) and `foreign_key_violation` (23503). Narrowing by constraint name is optional.
- **A transaction callback commits when it returns**, whatever the return value says; see
  Transactions above.
- **`FOR UPDATE` outside a transaction is released at once.** It guards nothing there, so
  every locking read is inside one.
- **An `ON CONFLICT` with no target** absorbs any unique conflict, so the vote's insert
  says "this identity already voted" whichever index refused it.
