// Pre-fetch the PR context the review agent reviews against (spec §4.4).
//
// The RUNNER SCRIPT does this read-only fetching and embeds it into the prompt;
// the agent itself never needs a token to mutate. Surfaces gathered:
//   - the linked issue (parsed from the PR body), when there is one: its title
//     AND its body — the body is the spec the review's Spec axis is checked
//     against, and the agent holds no token to fetch it itself. A PR may link no
//     issue at all, so all three issue fields are nullable; deciding whether that
//     is fatal belongs to the caller (§4.4 refuses in preflight, §4.5 does not);
//   - the linked issue's sub-issues, when it is a PRD: the Spec axis needs them
//     to tell "implements a sibling sub-issue" (scope violation) from
//     "implements this one";
//   - the diff, in two shapes: the full patch (used locally to validate inline
//     anchors) and `--stat` (the only shape embedded in the prompt);
//   - PR_COMMENTS_JSON: issue_comments, review_summaries, unresolved review_threads.

import { execFileSync } from "node:child_process";

import { gh } from "../lib/gh.mjs";

export interface ReviewContext {
  /** `null` when the PR body links no issue. */
  readonly issueNumber: string | null;
  /** `null` when the PR body links no issue. */
  readonly issueTitle: string | null;
  /** The issue body — the spec. Embedded in the prompt verbatim. `null` when unlinked. */
  readonly issueBody: string | null;
  /** Full patch. Used to validate inline anchors; NOT embedded in the prompt. */
  readonly diff: string;
  /** `git diff master...HEAD --stat` — the diff shape the prompt embeds. */
  readonly diffStat: string;
  /** `#n [state] title` per sub-issue; empty when the issue is not a PRD. */
  readonly subIssues: string;
  /** Serialised bundle embedded verbatim into the prompt. */
  readonly prCommentsJson: string;
  /** GraphQL commentIds shown to the agent — replies to any other id are dropped. */
  readonly knownCommentIds: ReadonlySet<string>;
}

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** First `closes|fixes|resolves #<n>` in the PR body; `null` when there is none. */
function parseLinkedIssue(prBody: string): string | null {
  const match = /(?:closes|fixes|resolves)\s+#(\d+)/i.exec(prBody);
  return match ? match[1] : null;
}

/**
 * The linked issue's sub-issues, one `#n [state] title` per line. Empty when the
 * issue has none (the ordinary single-issue PR): the endpoint answers `[]` for a
 * leaf issue. A failure to read them must not sink a review, so anything thrown
 * here degrades to "no sub-issues" instead of propagating.
 */
function fetchSubIssues(repo: string, issueNumber: string): string {
  try {
    const raw = gh([
      "api",
      `repos/${repo}/issues/${issueNumber}/sub_issues`,
      "--jq",
      "[.[]|{number,state,title}]",
    ]);
    const subs = JSON.parse(raw || "[]") as Array<{
      number: number;
      state: string;
      title: string;
    }>;
    return subs.map((sub) => `#${sub.number} [${sub.state}] ${sub.title}`).join("\n");
  } catch {
    return "";
  }
}

export function buildReviewContext(repo: string, prNumber: string): ReviewContext {
  const [owner, name] = repo.split("/");

  const prBody = gh(["pr", "view", prNumber, "--json", "body", "--jq", ".body"]);
  const issueNumber = parseLinkedIssue(prBody);
  const issue =
    issueNumber === null
      ? null
      : (JSON.parse(gh(["issue", "view", issueNumber, "--json", "title,body"])) as {
          title: string;
          body: string | null;
        });
  const issueTitle = issue === null ? null : issue.title.trim();
  const issueBody = issue === null ? null : (issue.body ?? "").trim();

  // No issue means no sub-issues to look up, not an empty answer to fetch.
  const subIssues = issueNumber === null ? "" : fetchSubIssues(repo, issueNumber);

  const diff = git(["diff", "master...HEAD"]);
  const diffStat = git(["diff", "master...HEAD", "--stat"]);

  // Top-level PR comments (the "issue comments" surface of a PR).
  const issueComments = JSON.parse(
    gh(["api", `repos/${repo}/issues/${prNumber}/comments`, "--jq", "[.[]|{author:.user.login,body}]"]) || "[]",
  );

  // Bodies of submitted reviews (skip empty bodies).
  const reviewSummaries = JSON.parse(
    gh([
      "api",
      `repos/${repo}/pulls/${prNumber}/reviews`,
      "--jq",
      "[.[]|select(.body!=\"\")|{author:.user.login,body}]",
    ]) || "[]",
  );

  // Unresolved inline threads, each comment carrying its GraphQL id.
  const graphql = `query ($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        reviewThreads(first: 100) {
          nodes { id isResolved isOutdated
            comments(first: 50) { nodes { id path line originalLine body author { login } } } }
        }
      }
    }
  }`;
  const threadsRaw = JSON.parse(
    gh([
      "api",
      "graphql",
      "-f",
      `query=${graphql}`,
      "-F",
      `owner=${owner}`,
      "-F",
      `repo=${name}`,
      "-F",
      `number=${prNumber}`,
    ]),
  );

  const knownCommentIds = new Set<string>();
  const reviewThreads = (
    threadsRaw?.data?.repository?.pullRequest?.reviewThreads?.nodes ?? []
  )
    .filter((thread: { isResolved: boolean }) => thread.isResolved === false)
    .map((thread: { comments: { nodes: Array<Record<string, unknown>> } }) => ({
      comments: thread.comments.nodes.map((comment) => {
        knownCommentIds.add(comment.id as string);
        return {
          commentId: comment.id,
          path: comment.path,
          line: comment.line ?? comment.originalLine,
          author: (comment.author as { login?: string } | null)?.login ?? null,
          body: comment.body,
        };
      }),
    }));

  const prCommentsJson = JSON.stringify(
    { issue_comments: issueComments, review_summaries: reviewSummaries, review_threads: reviewThreads },
    null,
    2,
  );

  return {
    issueNumber,
    issueTitle,
    issueBody,
    diff,
    diffStat,
    subIssues,
    prCommentsJson,
    knownCommentIds,
  };
}
