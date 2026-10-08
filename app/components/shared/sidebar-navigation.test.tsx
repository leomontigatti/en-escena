import { Home, Receipt, Users } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import {
  SidebarNavigationGroups,
  type SidebarNavigationGroup,
} from "@/components/shared/sidebar-navigation";
import { SidebarProvider } from "@/components/ui/sidebar";

const navigationGroups = [
  {
    label: "Principal",
    items: [
      {
        label: "Inicio",
        to: "/portal",
        icon: Home,
      },
      {
        label: "Profesores",
        to: "/portal/profesores",
        icon: Users,
      },
      {
        label: "Finanzas",
        to: "/portal/finanzas",
        icon: Receipt,
      },
      {
        label: "Seminarios",
        to: "/portal/finanzas/seminarios",
        icon: Receipt,
      },
      {
        label: "Reportes",
        to: "/portal/reportes",
        icon: Receipt,
        disabled: true,
      },
    ],
  },
] satisfies SidebarNavigationGroup[];

describe("SidebarNavigationGroups", () => {
  test("marks root navigation as active only on the exact root path", () => {
    const rootMarkup = renderNavigation("/portal");
    const childMarkup = renderNavigation("/portal/profesores");

    expect(rootMarkup).toContain('data-active="true"');
    expect(rootMarkup).toContain('href="/portal"');
    expect(countOccurrences(childMarkup, 'data-active="true"')).toBe(1);
    expect(childMarkup).toContain('href="/portal/profesores"');
  });

  // A section nested under another section's path belongs to the deeper item
  // alone: lighting both would say the reader is in two places at once.
  test("marks only the most specific item when one item's path nests another's", () => {
    const nestedMarkup = renderNavigation("/portal/finanzas/seminarios");
    const parentMarkup = renderNavigation("/portal/finanzas/academy_1");

    expect(countOccurrences(nestedMarkup, 'data-active="true"')).toBe(1);
    expect(activeHref(nestedMarkup)).toBe("/portal/finanzas/seminarios");
    expect(countOccurrences(parentMarkup, 'data-active="true"')).toBe(1);
    expect(activeHref(parentMarkup)).toBe("/portal/finanzas");
  });

  test("renders disabled navigation items without links", () => {
    const markup = renderNavigation("/portal");

    expect(markup).toContain("Reportes");
    expect(markup).toContain("disabled");
    expect(markup).not.toContain('href="/portal/reportes"');
  });
});

function renderNavigation(pathname: string) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[pathname]}>
      <SidebarProvider>
        <SidebarNavigationGroups groups={navigationGroups} rootPath="/portal" />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

function activeHref(markup: string) {
  return markup.match(/data-active="true"[^>]*href="([^"]+)"/)?.[1] ?? null;
}

function countOccurrences(value: string, search: string) {
  return value.split(search).length - 1;
}
