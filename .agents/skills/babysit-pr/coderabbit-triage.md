# CodeRabbit triage

The rubric step 3 of [SKILL.md](SKILL.md) applies to every finding. CodeRabbit reads the diff and
`docs/agents/coding-standards.md`; it has neither the issue nor the domain, so each claim is checked
against the code before it is acted on.

## The three verbs

- **fix**: the claim holds on the branch and the change is in the PR's scope. Fix it, reply with
  the SHA, resolve.
- **decline**: the code disproves the claim, or it matches a pattern below. Reply with the
  disproof (a `file:line`, a test, the invariant that covers it) and resolve. "Intentional" alone
  is not a reason.
- **ask**: the call is the user's. Leave the thread open and bring it to them.

Always **ask**, whatever a pattern says, when the finding touches money (payments, prices,
finances, `comprobante` emission), results or judging, auth, a migration, a destructive data
path, or a term defined in `GLOSSARY.md`; when it needs a product decision; and when a person, not
CodeRabbit, opened the thread.

A finding backed by `docs/agents/coding-standards.md` or `docs/agents/style-guide.md` is never
declined on the triager's judgement alone: it is a **fix**, or an **ask** when the code is a
deliberate exception the user rules on. The one ruling already given is a spec that names the
exception in so many words: decline only by quoting that line of the PRD or issue. A comment in
the code is the implementer's claim, not the ruling; it points at where to look.

From CodeRabbit's third pass on a PR (its third review with a body), lean toward **decline** for a
finding that matches a pattern below: code churned to quiet a bot is a cost, not a fix. The
always-ask list still wins.

## Patterns

Add one when the same shape was declined on two PRs, and delete one that starts hiding real
findings. Format:

```markdown
### <short name>

- Confidence: candidate | recurring | strong
- Decline when: <conditions that must all hold>
- Not when: <the risk boundary>
- Signal: <phrases or code shapes that identify it>
- Source: <PR or comment URL>
```

### An invariant elsewhere already covers it

- Confidence: candidate
- Decline when: the guarantee the finding asks for is enforced by a shared component, a loader or
  action guard, a schema constraint or a type, and you can cite its `file:line`.
- Not when: the invariant is assumed rather than enforced, or it depends on timing across an async
  boundary.
- Signal: "missing null check", "could be undefined", "add validation" on a value a loader
  already 404s on or a schema already constrains.
- Source: pstack's Bugbot rubric (cursor/plugins), "Existing framework or component invariant".

### A later PR in the stack uses it

- Confidence: candidate
- Decline when: the PR is a layer of a stack and the flagged export, helper or file is used by a
  layer above it, which you can show in that layer's diff.
- Not when: the PR is not stacked, or the use cannot be shown.
- Signal: "exported but never used", "dead code" on a new symbol.
- Source: pstack's Bugbot rubric (cursor/plugins), "Upstack or stack-local usage".

## Commands

Reading the round: the unresolved threads with their ids, then CodeRabbit's latest review with
the time it was posted. The review's body findings sit in its "Prompt to fix review comments"
block, outside the "Inline comments" section, which repeats the threads. Last, CodeRabbit's latest
comment, which is where it answers a request: a rate limit, a skip, or "Action not completed" when
a push cancelled the review. It edits that reply in place, so read the current body.

```bash
gh api graphql -f query='query($owner:String!,$repo:String!,$n:Int!){
  repository(owner:$owner,name:$repo){ pullRequest(number:$n){
    reviewThreads(first:100){ nodes{ id isResolved isOutdated path line
      comments(first:20){ nodes{ author{login} body } } } } } } }' \
  -F owner=leomontigatti -F repo=en-escena -F n=<PR> \
  --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved | not)'

gh pr view <PR> --json reviews \
  --jq '[.reviews[] | select((.author.login | startswith("coderabbitai")) and .body != "")] | last | {submittedAt, body}'

gh pr view <PR> --json comments \
  --jq '[.comments[] | select(.author.login | startswith("coderabbitai"))] | last | .body'
```

Answering it:

```bash
gh api graphql -f query='mutation($id:ID!,$body:String!){
  addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$id,body:$body}){ comment{url} } }' \
  -F id=<THREAD_ID> -F body=@reply.md

gh api graphql -f query='mutation($id:ID!){
  resolveReviewThread(input:{threadId:$id}){ thread{isResolved} } }' -F id=<THREAD_ID>

gh pr comment <PR> --body-file answer.md
```
