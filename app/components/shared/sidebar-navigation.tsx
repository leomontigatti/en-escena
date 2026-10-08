import type { LucideIcon } from "lucide-react";
import { NavLink, useLocation } from "react-router";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type SidebarNavigationItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  disabled?: boolean;
};

type SidebarNavigationGroup = {
  label?: string;
  items: SidebarNavigationItem[];
};

type SidebarNavigationGroupsProps = {
  groups: SidebarNavigationGroup[];
  rootPath: string;
};

function SidebarNavigationGroups({
  groups,
  rootPath,
}: SidebarNavigationGroupsProps) {
  const location = useLocation();
  const activePath = findActiveNavigationPath(
    location.pathname,
    groups.flatMap((group) => group.items.map((item) => item.to)),
    rootPath,
  );

  return groups.map((group, index) => (
    <SidebarGroup key={group.label ?? `navigation-group-${index}`}>
      {group.label ? (
        <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
      ) : null}
      <SidebarMenu>
        {group.items.map((item) => (
          <SidebarNavigationMenuItem
            key={item.to}
            item={item}
            isActive={item.to === activePath}
          />
        ))}
      </SidebarMenu>
    </SidebarGroup>
  ));
}

function SidebarNavigationMenuItem({
  item,
  isActive,
}: {
  item: SidebarNavigationItem;
  isActive: boolean;
}) {
  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      {item.disabled ? (
        <SidebarMenuButton disabled tooltip={item.label}>
          <Icon aria-hidden="true" />
          <span>{item.label}</span>
        </SidebarMenuButton>
      ) : (
        <SidebarMenuButton asChild tooltip={item.label} isActive={isActive}>
          <NavLink to={item.to}>
            <Icon aria-hidden="true" />
            <span>{item.label}</span>
          </NavLink>
        </SidebarMenuButton>
      )}
    </SidebarMenuItem>
  );
}

/**
 * The one item the reader is in: the deepest whose path holds the current one.
 * A section can live under another's path (`Finanzas › Seminarios` under the
 * academy list's `/administracion/finanzas`), and only the deeper one is where
 * the reader is.
 */
function findActiveNavigationPath(
  pathname: string,
  paths: string[],
  rootPath: string,
): string | null {
  return paths
    .filter((to) => isNavigationItemActive(pathname, to, rootPath))
    .reduce<string | null>(
      (deepest, to) =>
        deepest === null || to.length > deepest.length ? to : deepest,
      null,
    );
}

function isNavigationItemActive(
  pathname: string,
  to: string,
  rootPath: string,
) {
  if (to === rootPath) {
    return pathname === to;
  }

  return pathname === to || pathname.startsWith(`${to}/`);
}

export {
  SidebarNavigationGroups,
  type SidebarNavigationGroup,
  type SidebarNavigationItem,
};
