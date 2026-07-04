import { describe, expect, test } from "vitest";

import { parseIssueArg } from "../.sandcastle/issue-args.mjs";

describe("Sandcastle issue args", () => {
  test("accepts pnpm's forwarded argument separator before an issue flag", () => {
    expect(parseIssueArg(["--", "--issue", "207"])).toBe("207");
  });

  test("accepts supported issue argument forms", () => {
    expect(parseIssueArg([])).toBeUndefined();
    expect(parseIssueArg(["--"])).toBeUndefined();
    expect(parseIssueArg(["--issue", "207"])).toBe("207");
    expect(parseIssueArg(["-i", "207"])).toBe("207");
    expect(parseIssueArg(["--issue=207"])).toBe("207");
    expect(parseIssueArg(["207"])).toBe("207");
    expect(parseIssueArg(["--", "207"])).toBe("207");
  });

  test("rejects invalid issue arguments", () => {
    expect(() => parseIssueArg(["--issue"])).toThrow(/Usage: pnpm sandcastle/);
    expect(() => parseIssueArg(["--issue", "abc"])).toThrow(
      /Usage: pnpm sandcastle/,
    );
    expect(() => parseIssueArg(["207", "extra"])).toThrow(
      /Usage: pnpm sandcastle/,
    );
  });
});
