import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const guardrailFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(guardrailFile);
const repositoryRoot = path.resolve(currentDirectory, "../../../");
const routesDirectory = path.join(repositoryRoot, "app", "routes");
const routeFilePattern = /\.(ts|tsx)$/;

// A route module that exports an `action` and no `clientAction` sends an
// unexpected failure — a service throwing, the network dropping — to the root
// `ErrorBoundary`, which unmounts the open dialog together with everything the
// user typed (#989). The rule is prose in `docs/agents/form-feedback.md`; this
// is what holds it for a route added later.
//
// A route exports its `action` in one of two shapes, and the second one is the
// one that hid three admin routes from the #989 sweep: the users routes keep
// the handler in `features/` and re-export it (`export { action, loader };`),
// so a declaration-only pattern reads them as having no action at all.
const actionDeclarationPattern =
  /^export\s+(?:async\s+)?(?:function|const)\s+action\b/m;
const clientActionDeclarationPattern =
  /^export\s+(?:async\s+)?(?:function|const)\s+clientAction\b/m;

function reExportPattern(name: string): RegExp {
  // `export { a, action, b };` and `export { action as action };`, over the one
  // or more lines Prettier may wrap the list onto.
  return new RegExp(`^export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*;`, "m");
}

// The three declared exceptions, all resource routes with no mounted view, so
// there is nowhere for a returned error result to go:
// - `$`: the catch-all, whose `action` returns a plain 404 `Response`.
// - `api.auth.$`: Better Auth's own handler, hit by its client and not by a
//   React Router submit.
// - `salir`: signing out always throws a `redirect`, which is rethrown anyway.
const routesWithoutClientAction = ["$.tsx", "api.auth.$.tsx", "salir.tsx"];

describe("route clientAction coverage", () => {
  test("every route module with an action exports a clientAction", () => {
    const offenders = getRouteFiles()
      .filter((filePath) => !isDeclaredException(filePath))
      .filter((filePath) => {
        const source = readFileSync(filePath, "utf8");

        return exportsAction(source) && !exportsClientAction(source);
      })
      .map(toRepositoryPath);

    expect(offenders).toEqual([]);
  });

  test("every declared exception still exists and still exports an action", () => {
    const stale = routesWithoutClientAction.filter((fileName) => {
      const filePath = path.join(routesDirectory, fileName);

      return !getRouteFiles().includes(filePath);
    });

    expect(stale).toEqual([]);

    const withoutAction = routesWithoutClientAction.filter(
      (fileName) =>
        !exportsAction(
          readFileSync(path.join(routesDirectory, fileName), "utf8"),
        ),
    );

    expect(withoutAction).toEqual([]);
  });
});

// The sweep above passes just the same if a pattern stops matching, so these
// pin down each detector against the export shapes the repo actually uses.
describe("route clientAction guardrail", () => {
  test.each([
    "export async function action({ request }: Route.ActionArgs) {}",
    "export function action() {}",
    "export const action = async () => {};",
    // The re-export shape the #989 sweep originally missed, on one line and
    // wrapped over several, which is how Prettier breaks a long list.
    "export { action, loader, InternalUserDetailRouteView };",
    "export {\n  action,\n  loader,\n  internalInvitationRedirectPath,\n};",
    "export { loader, action };",
  ])("reads %s as an action export", (source) => {
    expect(exportsAction(source)).toBe(true);
  });

  test.each([
    "export async function clientAction({ serverAction }: Route.ClientActionArgs) {}",
    "export const clientAction = async () => {};",
    "export { clientAction, loader };",
  ])("reads %s as a clientAction export", (source) => {
    expect(exportsClientAction(source)).toBe(true);
  });

  // `clientAction` starts with the `action` pattern's own suffix, and a local
  // helper or a re-export is not a route export: both would make the sweep pass
  // on a module that never wires the helper.
  test.each([
    "export async function clientAction({ serverAction }: Route.ClientActionArgs) {}",
    "async function action() {}",
    "const actionIntent = 1;",
    "export const actionData = 1;",
    "export { clientAction };",
    "export { recoverableClientAction };",
    'import { action } from "@/features/admin/users/detail/server";',
  ])("does not read %s as an action export", (source) => {
    expect(exportsAction(source)).toBe(false);
  });

  test.each([
    "export async function action() {}",
    "export { action, loader };",
  ])("does not read %s as a clientAction export", (source) => {
    expect(exportsClientAction(source)).toBe(false);
  });
});

function getRouteFiles(): string[] {
  return readdirSync(routesDirectory)
    .filter((fileName) => routeFilePattern.test(fileName))
    .filter((fileName) => !fileName.endsWith(".test.ts"))
    .filter((fileName) => !fileName.endsWith(".test.tsx"))
    .map((fileName) => path.join(routesDirectory, fileName))
    .sort();
}

function exportsAction(source: string): boolean {
  return (
    actionDeclarationPattern.test(source) ||
    reExportPattern("action").test(source)
  );
}

function exportsClientAction(source: string): boolean {
  return (
    clientActionDeclarationPattern.test(source) ||
    reExportPattern("clientAction").test(source)
  );
}

function isDeclaredException(filePath: string): boolean {
  return routesWithoutClientAction.includes(path.basename(filePath));
}

function toRepositoryPath(filePath: string): string {
  return path.relative(repositoryRoot, filePath);
}
