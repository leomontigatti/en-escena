import { describe, expect, test } from "vitest";

import {
  DOC_CHANGE_NOT_NEEDED_TRAILER,
  findDocChangeNotNeededReasons,
  findUndocumentedChanges,
  formatUndocumentedChange,
  isExcludedFromDocGate,
  matchesCodePattern,
  parseDocMap,
  staticPrefixOf,
} from "./doc-map.mjs";

const docMap = [
  { doc: "docs/domain/access.md", code: ["app/lib/auth/**"] },
  {
    doc: "docs/operations/infrastructure.md",
    code: ["app/lib/storage/**", "app/lib/portal/choreography-music.server.ts"],
  },
];

describe("doc map matching", () => {
  test("matches a directory glob at any depth", () => {
    expect(
      matchesCodePattern(
        "app/lib/auth/access-auth-provider.server.ts",
        "app/lib/auth/**",
      ),
    ).toBe(true);
    expect(
      matchesCodePattern("app/lib/auth/nested/deep.ts", "app/lib/auth/**"),
    ).toBe(true);
    expect(
      matchesCodePattern("app/lib/authorization/thing.ts", "app/lib/auth/**"),
    ).toBe(false);
  });

  test("matches an individual file listed on its own", () => {
    expect(
      matchesCodePattern(
        "app/lib/portal/choreography-music.server.ts",
        "app/lib/portal/choreography-music.server.ts",
      ),
    ).toBe(true);
    expect(
      matchesCodePattern(
        "app/lib/portal/choreographies.server.ts",
        "app/lib/portal/choreography-music.server.ts",
      ),
    ).toBe(false);
  });

  test("reports the directory a pattern is rooted at", () => {
    expect(staticPrefixOf("app/lib/auth/**")).toBe("app/lib/auth");
    expect(staticPrefixOf("app/lib/portal/choreography-music.server.ts")).toBe(
      "app/lib/portal",
    );
  });

  test("parses the shipped map format", () => {
    expect(
      parseDocMap('[{ "doc": "docs/a.md", "code": ["app/b/**"] }]'),
    ).toEqual([{ doc: "docs/a.md", code: ["app/b/**"] }]);
    expect(() => parseDocMap('{ "docs/a.md": ["app/b/**"] }')).toThrow();
  });
});

describe("doc gate", () => {
  test("fires when mapped code changes and its document does not", () => {
    expect(
      findUndocumentedChanges({
        docMap,
        changedFiles: [
          "app/lib/auth/access-auth-provider.server.ts",
          "app/routes/acceso.tsx",
        ],
      }),
    ).toEqual([
      {
        doc: "docs/domain/access.md",
        codeFiles: ["app/lib/auth/access-auth-provider.server.ts"],
      },
    ]);
  });

  test("stays quiet when the mapped document is touched in the same PR", () => {
    expect(
      findUndocumentedChanges({
        docMap,
        changedFiles: [
          "app/lib/auth/access-auth-provider.server.ts",
          "docs/domain/access.md",
        ],
      }),
    ).toEqual([]);
  });

  // A test change does not alter documented behaviour, and firing on tests is
  // what trains reflexive escape-hatch use.
  test("ignores test files and test support", () => {
    expect(isExcludedFromDocGate("app/lib/auth/x.test.ts")).toBe(true);
    expect(isExcludedFromDocGate("app/lib/auth/x.db.test.ts")).toBe(true);
    expect(isExcludedFromDocGate("app/lib/auth/x.render.test.tsx")).toBe(true);
    expect(
      isExcludedFromDocGate("app/lib/auth/access-auth.test-support.ts"),
    ).toBe(true);
    expect(isExcludedFromDocGate("app/lib/auth/access-auth-client.ts")).toBe(
      false,
    );

    expect(
      findUndocumentedChanges({
        docMap,
        changedFiles: [
          "app/lib/auth/access-auth-provider.server.test.ts",
          "app/lib/storage/b2-client.server.test.ts",
          "app/lib/auth/access-auth.test-support.ts",
        ],
      }),
    ).toEqual([]);
  });

  // Deleting a documented provider is one of the strongest cases for the
  // document needing to change, so a removed path is still a changed path.
  test("fires on a deleted mapped file and on a file mapped individually", () => {
    expect(
      findUndocumentedChanges({
        docMap,
        changedFiles: [
          "app/lib/auth/access-auth-provider.supabase.server.ts",
          "app/lib/portal/choreography-music.server.ts",
        ],
      }),
    ).toEqual([
      {
        doc: "docs/domain/access.md",
        codeFiles: ["app/lib/auth/access-auth-provider.supabase.server.ts"],
      },
      {
        doc: "docs/operations/infrastructure.md",
        codeFiles: ["app/lib/portal/choreography-music.server.ts"],
      },
    ]);
  });

  test("reads the escape-hatch trailer only when it states a reason", () => {
    expect(
      findDocChangeNotNeededReasons(
        `refactor: rename an internal helper\n\n${DOC_CHANGE_NOT_NEEDED_TRAILER}: pure rename, no documented behaviour moved\n`,
      ),
    ).toEqual(["pure rename, no documented behaviour moved"]);
    expect(
      findDocChangeNotNeededReasons(
        `chore: something\n\n${DOC_CHANGE_NOT_NEEDED_TRAILER}:\n`,
      ),
    ).toEqual([]);
    expect(
      findDocChangeNotNeededReasons(
        `chore: mentions ${DOC_CHANGE_NOT_NEEDED_TRAILER}: inline in prose\n`,
      ),
    ).toEqual([]);
  });

  // The message is the mechanism: an AFK runner holds no GitHub token and
  // cannot read anything this text does not say.
  test("names the code, the document and the verbatim escape hatch", () => {
    const message = formatUndocumentedChange({
      doc: "docs/domain/access.md",
      codeFiles: ["app/lib/auth/access-auth-provider.server.ts"],
    });

    expect(message).toContain("app/lib/auth/access-auth-provider.server.ts");
    expect(message).toContain("docs/domain/access.md");
    expect(message).toContain(`${DOC_CHANGE_NOT_NEEDED_TRAILER}: <reason>`);
    expect(message).toContain("legitimate answer");
  });
});
