export function parseIssueArg(args: readonly string[]): string | undefined {
  const normalizedArgs = stripLeadingArgumentSeparators(args);

  if (normalizedArgs.length === 0) return undefined;

  const [first, second, ...rest] = normalizedArgs;
  let issueId: string | undefined;

  if (first === "--issue" || first === "-i") {
    issueId = second;
    if (rest.length > 0) throw new Error(usageMessage());
  } else if (first?.startsWith("--issue=")) {
    issueId = first.slice("--issue=".length);
    if (second !== undefined || rest.length > 0) throw new Error(usageMessage());
  } else if (first && /^\d+$/.test(first)) {
    issueId = first;
    if (second !== undefined || rest.length > 0) throw new Error(usageMessage());
  } else {
    throw new Error(usageMessage());
  }

  if (!issueId || !/^\d+$/.test(issueId)) {
    throw new Error(usageMessage());
  }

  return issueId;
}

function stripLeadingArgumentSeparators(
  args: readonly string[],
): readonly string[] {
  let start = 0;

  while (args[start] === "--") {
    start++;
  }

  return args.slice(start);
}

function usageMessage(): string {
  return "Usage: pnpm sandcastle [--issue <number>] or pnpm sandcastle [<number>]";
}
