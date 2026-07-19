// Pre-fetch the PR context the review agent reviews against (spec §4.4).
//
// The RUNNER SCRIPT does this read-only fetching and embeds it into the prompt;
// the agent itself never needs a token to mutate. Surfaces gathered:
//   - the linked issue (parsed from the PR body) and its title;
//   - the diff (`git diff master...HEAD`);
//   - PR_COMMENTS_JSON: issue_comments, review_summaries, unresolved review_threads.

import { execFileSync } from "node:child_process";

export interface ReviewContext {
  readonly issueNumber: string;
  readonly issueTitle: string;
  readonly diff: string;
  /** Serialised bundle embedded verbatim into the prompt. */
  readonly prCommentsJson: string;
  /** GraphQL commentIds shown to the agent — replies to any other id are dropped. */
  readonly knownCommentIds: ReadonlySet<string>;
}

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function gh(args: string[]): string {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** First `closes|fixes|resolves #<n>` in the PR body. */
function parseLinkedIssue(prBody: string): string {
  const match = /(?:closes|fixes|resolves)\s+#(\d+)/i.exec(prBody);
  if (!match) {
    throw new Error(
      "Could not find a linked issue (closes/fixes/resolves #N) in the PR body.",
    );
  }
  return match[1];
}

export function buildReviewContext(repo: string, prNumber: string): ReviewContext {
  const [owner, name] = repo.split("/");

  const prBody = gh(["pr", "view", prNumber, "--json", "body", "--jq", ".body"]);
  const issueNumber = parseLinkedIssue(prBody);
  const issueTitle = gh([
    "issue",
    "view",
    issueNumber,
    "--json",
    "title",
    "--jq",
    ".title",
  ]).trim();

  const diff = git(["diff", "master...HEAD"]);

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

  return { issueNumber, issueTitle, diff, prCommentsJson, knownCommentIds };
}
