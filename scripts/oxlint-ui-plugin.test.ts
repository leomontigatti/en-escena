import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import uiPlugin from "./oxlint-ui-plugin.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const oxlintBin = path.join(repoRoot, "node_modules", ".bin", "oxlint");
const pluginPath = path.join(repoRoot, "scripts", "oxlint-ui-plugin.mjs");

const violatingFixture = `
import { Button } from "@/components/ui/button";
import { Input } from "../components/ui/input";
import { cn } from "@/lib/utils";

export function Violating() {
  return (
    <form>
      <button type="submit">Guardar</button>
      <select name="kind" />
      <textarea name="notes" />
      <input type="text" name="title" />
      <input type="checkbox" name="accepted" />
      <Button className="h-12 w-full">Alto</Button>
      <Input className={cn("w-full", "rounded-none")} />
      <Button className={\`w-full focus-visible:ring-2\`}>Anillo</Button>
    </form>
  );
}
`;

const compliantFixture = `
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input } from "../components/ui/input";
import { cn } from "@/lib/utils";

export function Compliant(props: { active: boolean; className?: string; extra: string }) {
  return (
    <form>
      <input type="hidden" name="id" value="1" />
      <Button variant="outline" size="sm" className="w-full justify-start gap-2">
        Guardar
      </Button>
      <Input className={cn("w-full", props.className)} />
      <Button className={props.active ? "rounded-none" : ""}>Dinámico</Button>
      <Button className={\`w-full \${props.extra}\`}>Plantilla</Button>
      <DropdownMenuItem asChild>
        <button type="submit">Salir</button>
      </DropdownMenuItem>
      <div className="h-8 rounded-lg ring-2" />
    </form>
  );
}
`;

type Diagnostic = {
  code: string;
  message: string;
  filename: string;
  labels: { span: { line: number } }[];
};

function lint(directory: string, file: string) {
  const result = spawnSync(
    oxlintBin,
    ["-c", ".oxlintrc.json", "--format", "json", file],
    { cwd: directory, encoding: "utf8" },
  );
  const output = JSON.parse(result.stdout) as { diagnostics: Diagnostic[] };
  return output.diagnostics
    .map((diagnostic) => ({
      rule: diagnostic.code,
      line: diagnostic.labels[0]?.span.line ?? 0,
      message: diagnostic.message,
    }))
    .sort((left, right) => left.line - right.line);
}

describe("ui oxlint plugin", () => {
  let tempRoot: string;

  beforeAll(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "oxlint-ui-plugin-"));
    await mkdir(path.join(tempRoot, "app", "features"), { recursive: true });
    await writeFile(
      path.join(tempRoot, ".oxlintrc.json"),
      JSON.stringify({
        categories: { correctness: "off" },
        plugins: [],
        jsPlugins: [pluginPath],
        rules: {
          "ui/no-raw-form-element": "error",
          "ui/no-restyle": "error",
        },
      }),
    );
    await writeFile(
      path.join(tempRoot, "app", "features", "violating.tsx"),
      violatingFixture,
    );
    await writeFile(
      path.join(tempRoot, "app", "features", "compliant.tsx"),
      compliantFixture,
    );
  });

  afterAll(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  test("flags raw form elements and restyled ui components", () => {
    const diagnostics = lint(tempRoot, "app/features/violating.tsx");

    expect(diagnostics.map(({ rule, line }) => ({ rule, line }))).toEqual([
      { rule: "ui(no-raw-form-element)", line: 9 },
      { rule: "ui(no-raw-form-element)", line: 10 },
      { rule: "ui(no-raw-form-element)", line: 11 },
      { rule: "ui(no-raw-form-element)", line: 12 },
      { rule: "ui(no-raw-form-element)", line: 13 },
      { rule: "ui(no-restyle)", line: 14 },
      { rule: "ui(no-restyle)", line: 15 },
      { rule: "ui(no-restyle)", line: 16 },
    ]);
    expect(diagnostics[0]?.message).toContain("Use Button");
    expect(diagnostics[1]?.message).toContain("Use Select");
    expect(diagnostics[2]?.message).toContain("Use Textarea");
    expect(diagnostics[3]?.message).toContain("Use Input");
    expect(diagnostics[4]?.message).toContain("Use Checkbox");
    expect(diagnostics[5]?.message).toContain("`h-12` restyles <Button>");
    expect(diagnostics[6]?.message).toContain(
      "`rounded-none` restyles <Input>",
    );
    expect(diagnostics[7]?.message).toContain(
      "`focus-visible:ring-2` restyles <Button>",
    );
  });

  test("stays silent on hidden inputs, variants, layout classes, slot children and dynamic classes", () => {
    expect(lint(tempRoot, "app/features/compliant.tsx")).toEqual([]);
  });

  test("the repo config enables every rule the plugin defines, and only those", async () => {
    const config = JSON.parse(
      await readFile(path.join(repoRoot, ".oxlintrc.json"), "utf8"),
    ) as { overrides: { rules: Record<string, string> }[] };
    const enabled = config.overrides.flatMap((override) =>
      Object.entries(override.rules)
        .filter(([rule, level]) => rule.startsWith("ui/") && level === "error")
        .map(([rule]) => rule),
    );

    expect(enabled.sort()).toEqual(
      Object.keys(uiPlugin.rules)
        .map((rule) => `ui/${rule}`)
        .sort(),
    );
  });
});
