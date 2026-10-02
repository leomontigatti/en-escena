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
import { TableCell } from "@/components/ui/table";
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
      <input type="file" name="photo" />
      <TableCell className="h-24 rounded-none">Sin datos</TableCell>
      <input type="file" name="photo" className="sr-only sm:not-sr-only" />
    </form>
  );
}
`;

const compliantFixture = `
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input } from "../components/ui/input";
import { TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function PrintDocument() {
  return (
    <html lang="es">
      <body>
        <button type="button" id="print-button">Imprimir</button>
      </body>
    </html>
  );
}

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
      <label>
        <input type="file" name="photo" className="sr-only" />
      </label>
      <TableCell colSpan={3} className="h-24 text-center">Sin datos</TableCell>
    </form>
  );
}
`;

const conventionsViolatingFixture = `
import { Trash } from "lucide-react";
import { AlertDialogContent } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DialogContent } from "@/components/ui/dialog";
import { TabsList } from "@/components/ui/tabs";

export function Violating() {
  return (
    <div>
      <TabsList />
      <TabsList variant="default" />
      <Button><Trash data-icon />Eliminar</Button>
      <Button><Trash data-icon="start" />Eliminar</Button>
      <Button><Trash data-icon={true} />Eliminar</Button>
      <AlertDialogContent size="sm" />
      <AlertDialogContent className="max-h-full sm:max-w-sm" />
      <DialogContent className="sm:max-w-lg" />
    </div>
  );
}
`;

const conventionsCompliantFixture = `
import { Trash2 } from "lucide-react";
import { AlertDialogContent } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DialogContent } from "@/components/ui/dialog";
import { TabsList } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

function TabsListLookalike(props: { size?: string; className?: string }) {
  return <div className={props.className} />;
}

export function Compliant(props: { end: boolean; className?: string }) {
  return (
    <div>
      <TabsList variant="line" />
      <Button><Trash2 data-icon="inline-start" />Eliminar</Button>
      <Button>Siguiente<Trash2 data-icon="inline-end" /></Button>
      <Button><Trash2 data-icon={props.end ? "inline-end" : "inline-start"} /></Button>
      <Button size="icon"><Trash2 aria-hidden="true" /></Button>
      <AlertDialogContent />
      <AlertDialogContent className={cn("max-h-[calc(100dvh-2rem)] sm:max-w-lg", props.className)} />
      <DialogContent className="max-h-[90vh] overflow-y-auto" />
      <DialogContent className={props.end ? "w-full" : "max-w-2xl"} />
      <TabsListLookalike size="sm" className="max-w-2xl" />
      <div className="max-w-md" />
    </div>
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
    const repoConfig = JSON.parse(
      await readFile(path.join(repoRoot, ".oxlintrc.json"), "utf8"),
    ) as { rules: Record<string, unknown> };
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
          "ui/tabs-line-variant": "error",
          "ui/data-icon-position": "error",
          "ui/dialog-width": "error",
          // The repo's own entry, so the test judges the config that ships.
          "no-restricted-imports": repoConfig.rules["no-restricted-imports"],
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
    await writeFile(
      path.join(tempRoot, "app", "features", "conventions-violating.tsx"),
      conventionsViolatingFixture,
    );
    await writeFile(
      path.join(tempRoot, "app", "features", "conventions-compliant.tsx"),
      conventionsCompliantFixture,
    );
  });

  afterAll(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  test("flags raw form elements and restyled ui components", () => {
    const diagnostics = lint(tempRoot, "app/features/violating.tsx");

    expect(diagnostics).toEqual([
      {
        rule: "ui(no-raw-form-element)",
        line: 10,
        message: expect.stringContaining("Use Button"),
      },
      {
        rule: "ui(no-raw-form-element)",
        line: 11,
        message: expect.stringContaining("Use Select"),
      },
      {
        rule: "ui(no-raw-form-element)",
        line: 12,
        message: expect.stringContaining("Use Textarea"),
      },
      {
        rule: "ui(no-raw-form-element)",
        line: 13,
        message: expect.stringContaining("Use Input"),
      },
      {
        rule: "ui(no-raw-form-element)",
        line: 14,
        message: expect.stringContaining("Use Checkbox"),
      },
      {
        rule: "ui(no-restyle)",
        line: 15,
        message: expect.stringContaining("`h-12` restyles <Button>"),
      },
      {
        rule: "ui(no-restyle)",
        line: 16,
        message: expect.stringContaining("`rounded-none` restyles <Input>"),
      },
      {
        rule: "ui(no-restyle)",
        line: 17,
        message: expect.stringContaining(
          "`focus-visible:ring-2` restyles <Button>",
        ),
      },
      {
        rule: "ui(no-raw-form-element)",
        line: 18,
        message: expect.stringContaining("Use Input"),
      },
      {
        rule: "ui(no-restyle)",
        line: 19,
        message: expect.stringContaining("`rounded-none` restyles <TableCell>"),
      },
      {
        rule: "ui(no-raw-form-element)",
        line: 20,
        message: expect.stringContaining("Use Input"),
      },
    ]);
  });

  test("stays silent on hidden inputs, variants, layout classes, slot children, dynamic classes, visually hidden overlays, standalone documents and table cell heights", () => {
    expect(lint(tempRoot, "app/features/compliant.tsx")).toEqual([]);
  });

  test("flags tabs without the line variant, unpositioned button icons, dialog width overrides and the Trash icon", () => {
    const diagnostics = lint(
      tempRoot,
      "app/features/conventions-violating.tsx",
    );

    expect(diagnostics).toEqual([
      {
        rule: "eslint(no-restricted-imports)",
        line: 2,
        message: expect.stringContaining("'Trash' import from 'lucide-react'"),
      },
      {
        rule: "ui(tabs-line-variant)",
        line: 11,
        message: expect.stringContaining('variant="line"'),
      },
      {
        rule: "ui(tabs-line-variant)",
        line: 12,
        message: expect.stringContaining('variant="line"'),
      },
      {
        rule: "ui(data-icon-position)",
        line: 13,
        message: expect.stringContaining("inline-start"),
      },
      {
        rule: "ui(data-icon-position)",
        line: 14,
        message: expect.stringContaining("inline-start"),
      },
      {
        rule: "ui(data-icon-position)",
        line: 15,
        message: expect.stringContaining("inline-start"),
      },
      {
        rule: "ui(dialog-width)",
        line: 16,
        message: expect.stringContaining("`size`"),
      },
      {
        rule: "ui(dialog-width)",
        line: 17,
        message: expect.stringContaining("`sm:max-w-sm`"),
      },
      {
        rule: "ui(dialog-width)",
        line: 18,
        message: expect.stringContaining("`sm:max-w-lg`"),
      },
    ]);
  });

  test("stays silent on line tabs, positioned and icon-only button icons, the wide alert dialog, dialog heights, dynamic classes and lookalike components", () => {
    expect(lint(tempRoot, "app/features/conventions-compliant.tsx")).toEqual(
      [],
    );
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
