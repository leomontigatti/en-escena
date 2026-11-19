import { describe, expect, test } from "vitest";

import { countEffects, effectProblems } from "./check-effects";

const component = (imports: string, body: string) =>
  `${imports}\n\nexport function Probe() {\n  ${body}\n  return null;\n}\n`;

describe("counting effects", () => {
  test("counts each effect hook called through a named import", () => {
    const source = component(
      `import { useEffect, useInsertionEffect, useLayoutEffect } from "react";`,
      "useEffect(() => {}); useLayoutEffect(() => {}); useInsertionEffect(() => {}); useEffect(() => {});",
    );

    expect(countEffects(source, "probe.tsx")).toBe(4);
  });

  test("counts one called through an alias, a namespace or a default import", () => {
    const source = component(
      `import React, * as R from "react";\nimport { useEffect as onMount } from "react";`,
      "onMount(() => {}); React.useEffect(() => {}); R.useLayoutEffect(() => {});",
    );

    expect(countEffects(source, "probe.tsx")).toBe(3);
  });

  test("counts one reached through a string-named import or a computed member", () => {
    const source = component(
      `import { default as R, "useLayoutEffect" as onLayout } from "react";\nimport React from "react";`,
      `R.useEffect(() => {}); onLayout(() => {}); React["useInsertionEffect"](() => {});`,
    );

    expect(countEffects(source, "probe.tsx")).toBe(3);
  });

  test("refuses a file it cannot parse, rather than counting it as none", () => {
    const source = component(
      `import { useEffect } from "react";`,
      "useEffect(() => {}); const = ;",
    );

    expect(() => countEffects(source, "app/broken.tsx")).toThrow(
      "app/broken.tsx",
    );
  });

  test("leaves calls that do not reach React's effect hooks", () => {
    const source = component(
      `import React, { useMemo } from "react";\nimport { useEffect } from "./not-react";`,
      `useMemo(() => 1, []); useEffect(); helpers.useEffect(); const useLayoutEffect = "useMemo"; React[useLayoutEffect](() => 1, []);`,
    );

    expect(countEffects(source, "probe.tsx")).toBe(0);
  });
});

describe("the effect ratchet", () => {
  const list = { "app/routes/a.tsx": 2 };

  test("passes a tree whose counts match a list master also holds", () => {
    expect(
      effectProblems({
        counts: { "app/routes/a.tsx": 2 },
        list,
        base: { state: "read", list },
      }),
    ).toEqual([]);
  });

  test("fails an effect in an unlisted file, and names app/hooks as where it goes", () => {
    const found = effectProblems({
      counts: { "app/routes/a.tsx": 2, "app/routes/b.tsx": 1 },
      list,
      base: { state: "read", list },
    });

    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/app\/routes\/b\.tsx.*1 effect.*0.*app\/hooks/);
  });
});
