# ISSUES

Here are the open issues in the repo:

<issues-json>

!`gh issue list --state open --label ready-for-agent --limit 100 --json number,title,body,labels,comments,parent,subIssuesSummary,blockedBy,blocking --jq '[.[] | {number, title, body: ((.body // "")[0:2000]), labels: [.labels[].name], parent, subIssuesSummary, blockedBy: [.blockedBy.nodes[]? | {number, title, state}], blocking: [.blocking.nodes[]? | {number, title, state}], comments: [(.comments[-2:][]?.body // "")[0:1200]]}]'`

</issues-json>

The list above has already been filtered to issues ready for work. It includes
native GitHub parent/sub-issue and blocking metadata when available.

Some issues can still be planning/container issues rather than implementation
tasks. Treat an issue as **not executable** when it is a PRD, parent epic,
tracking issue, or issue-breakdown container. Common signals include a title
starting with `PRD:` or a body organized around problem/solution/user stories
instead of acceptance criteria for a single implementation slice, or a
`subIssuesSummary.total` value showing that the issue itself contains child
work.

Do **not** treat an issue as non-executable merely because it has a `parent`.
Implementation sub-issues under a PRD are the preferred executable units when
they have the `ready-for-agent` label.

# TASK

Analyze the open issues and build a dependency graph. For each issue, determine whether it **blocks** or **is blocked by** any other open issue.

An issue B is **blocked by** issue A if:

- B lists A in native GitHub `blockedBy` metadata, or A lists B in native
  GitHub `blocking` metadata
- B requires code or infrastructure that A introduces
- B and A modify overlapping files or modules, making concurrent work likely to produce merge conflicts
- B's requirements depend on a decision or API shape that A will establish

An issue is **unblocked** if it has zero blocking dependencies on other open issues.

For each unblocked issue, assign a branch name using the exact format `sandcastle/issue-{id}` (no slug or other suffix). This must be deterministic so that re-planning the same issue always produces the same branch name and accumulated progress is preserved.

If an open issue already has its deterministic branch and that branch appears to
contain the implementation, still include the issue in the plan. The
orchestrator will detect existing unmerged commits and send the branch directly
to merge instead of asking an implementer to create more commits.

# OUTPUT

Output your plan as a JSON object wrapped in `<plan>` tags:

<plan>
{"issues": [{"id": "42", "title": "Fix auth bug", "branch": "sandcastle/issue-42"}]}
</plan>

Include only unblocked executable issues. Do not include PRDs, parent epics, or
tracking/container issues in the plan even if they are unblocked. Include
ready-for-agent implementation sub-issues when they are otherwise executable.

If every executable issue is blocked, include the single highest-priority
executable candidate (the one with the fewest or weakest dependencies).

Always emit the `<plan>` tags, even when there is nothing to do. If there are no issues to work on at all, output `<plan>{"issues": []}</plan>` so the run can exit cleanly.
