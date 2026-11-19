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

  test("leaves calls that do not reach React's effect hooks", () => {
    const source = component(
      `import { useMemo } from "react";\nimport { useEffect } from "./not-react";`,
      "useMemo(() => 1, []); useEffect(); helpers.useEffect();",
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

  test("fails a new effect outside app/hooks, and says where it goes", () => {
    const found = effectProblems({
      counts: { "app/routes/a.tsx": 2, "app/routes/b.tsx": 1 },
      list,
      base: { state: "read", list },
    });

    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/app\/routes\/b\.tsx.*1 effect.*0.*app\/hooks/);
  });
});
