# CodeRabbit triage

The rubric step 3 of [SKILL.md](SKILL.md) applies to every finding. CodeRabbit reads the diff and
`.sandcastle/CODING_STANDARDS.md`; it has neither the issue nor the domain, so each claim is checked
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
path, or a term defined in `CONTEXT.md`; when it needs a product decision; and when a person, not
CodeRabbit, opened the thread.

From CodeRabbit's third pass on a PR (`coderabbitPasses` ≥ 3), lean toward **decline** for a
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

The thread ids come from the watcher's `threads[].id`.

```bash
gh api graphql -f query='mutation($id:ID!,$body:String!){
  addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$id,body:$body}){ comment{url} } }' \
  -F id=<THREAD_ID> -F body=@reply.md

gh api graphql -f query='mutation($id:ID!){
  resolveReviewThread(input:{threadId:$id}){ thread{isResolved} } }' -F id=<THREAD_ID>

gh pr comment <PR> --body-file answer.md
```
