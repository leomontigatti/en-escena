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
        label: "Facturas",
        to: "/portal/facturas",
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

  test("renders disabled navigation items without links", () => {
    const markup = renderNavigation("/portal");

    expect(markup).toContain("Facturas");
    expect(markup).toContain("disabled");
    expect(markup).not.toContain('href="/portal/facturas"');
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

function countOccurrences(value: string, search: string) {
  return value.split(search).length - 1;
}
