import type { ReactNode } from "react";
import {
  AudioLines,
  ClipboardList,
  GraduationCap,
  HandCoins,
  House,
  Inbox,
  ListOrdered,
  Presentation,
  Trophy,
  User,
  Users,
} from "lucide-react";
import { Link, useLocation, type UIMatch } from "react-router";

import { AccountMenu } from "@/components/shared/account-menu";
import { useRecordTitleHeading } from "@/components/shared/record-title";
import { TopBarTools } from "@/components/shared/top-bar-tools";
import { EnEscenaAvatar } from "@/components/shared/en-escena-avatar";
import {
  SidebarNavigationGroups,
  type SidebarNavigationGroup,
  type SidebarNavigationItem,
} from "@/components/shared/sidebar-navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  eventStatusLabels,
  noActiveEventLabel,
} from "@/lib/events/event-status-copy";
import type { PortalShellEventContext } from "@/lib/portal/event-context";

type PortalShellProps = {
  userEmail: string;
  contactName: string | null;
  eventContext: PortalShellEventContext;
  children: ReactNode;
  breadcrumbItems?: PortalShellBreadcrumbItem[];
};

export type PortalShellBreadcrumbItem = {
  label: string;
  to?: string;
};

type PortalBreadcrumbFactory = (
  match: UIMatch,
) => PortalShellBreadcrumbItem | null;

export type PortalRouteHandle = {
  portalBreadcrumbs?: Array<
    PortalShellBreadcrumbItem | PortalBreadcrumbFactory
  >;
};

type PortalPageHeaderProps = {
  titleId: string;
  /** A node, not a string: a title can carry a badge beside it. */
  title: ReactNode;
  /** A badge for the record's state, drawn beside the title on a detail page. */
  titleBadge?: ReactNode;
  description: ReactNode;
  action?: ReactNode;
};

/**
 * The portal's page header, for a page that is not a list: `PortalListPage`
 * renders the same one above its content.
 */
export function PortalPageHeader({
  titleId,
  title,
  titleBadge,
  description,
  action,
}: PortalPageHeaderProps) {
  const recordTitle = useRecordTitleHeading();

  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={titleId} className="text-xl font-semibold" {...recordTitle}>
            {title}
          </h2>
          {titleBadge}
        </div>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      {action}
    </header>
  );
}

type PortalListPageProps = {
  titleId: string;
  /** A node, not a string: a title can carry a badge beside it. */
  title: ReactNode;
  titleBadge?: ReactNode;
  description: ReactNode;
  action?: ReactNode;
  children: ReactNode;
};

export function PortalListPage({
  titleId,
  title,
  titleBadge,
  description,
  action,
  children,
}: PortalListPageProps) {
  return (
    <section className="flex flex-col gap-6" aria-labelledby={titleId}>
      <PortalPageHeader
        titleId={titleId}
        title={title}
        titleBadge={titleBadge}
        description={description}
        action={action}
      />

      {children}
    </section>
  );
}

type PortalEmptyStateProps = {
  title: string;
  description: ReactNode;
  icon?: ReactNode;
};

export function PortalEmptyState({
  title,
  description,
  icon = <Inbox aria-hidden="true" />,
}: PortalEmptyStateProps) {
  return (
    <Empty className="min-h-64 border">
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className="size-10 [&_svg:not([class*='size-'])]:size-5"
        >
          {icon}
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

const primaryNavigationItems = [
  {
    label: "Inicio",
    to: "/portal",
    icon: House,
  },
  {
    label: "Profesores",
    to: "/portal/profesores",
    icon: GraduationCap,
  },
  {
    label: "Bailarines",
    to: "/portal/bailarines",
    icon: Users,
  },
  {
    label: "Coreografías",
    to: "/portal/coreografias",
    icon: AudioLines,
  },
  {
    label: "Presentaciones",
    to: "/portal/presentaciones",
    icon: ListOrdered,
  },
  {
    label: "Resultados",
    to: "/portal/resultados",
    icon: Trophy,
  },
  {
    label: "Seminarios",
    to: "/portal/seminarios",
    icon: Presentation,
  },
] satisfies SidebarNavigationItem[];

const financeNavigationItems = [
  {
    label: "Resumen",
    to: "/portal/finanzas",
    icon: ClipboardList,
  },
  {
    label: "Movimientos",
    to: "/portal/movimientos",
    icon: HandCoins,
  },
] satisfies SidebarNavigationItem[];

const accountNavigationItems = [
  {
    label: "Perfil",
    to: "/portal/perfil",
    icon: User,
  },
] satisfies SidebarNavigationItem[];

const navigationGroups = [
  {
    label: "Administración",
    items: primaryNavigationItems,
  },
  {
    label: "Finanzas",
    items: financeNavigationItems,
  },
  {
    label: "Cuenta",
    items: accountNavigationItems,
  },
] satisfies SidebarNavigationGroup[];

export function PortalShell({
  userEmail,
  contactName,
  eventContext,
  children,
  breadcrumbItems,
}: PortalShellProps) {
  const location = useLocation();
  const isHome = location.pathname === "/portal";
  const resolvedBreadcrumbItems = breadcrumbItems ?? [];
  const displayName = getPortalContactDisplayName(contactName, userEmail);

  return (
    <>
      <a
        href="#contenido-principal"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-background focus-visible:px-4 focus-visible:py-3 focus-visible:text-sm focus-visible:font-semibold focus-visible:text-foreground focus-visible:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30"
      >
        Saltar al contenido principal
      </a>
      <SidebarProvider>
        <Sidebar variant="inset">
          <SidebarHeader>
            <PortalActiveEventSummary eventContext={eventContext} />
          </SidebarHeader>

          <SidebarContent>
            <SidebarNavigationGroups
              groups={navigationGroups}
              rootPath="/portal"
            />
          </SidebarContent>
        </Sidebar>

        <SidebarInset>
          <header className="flex shrink-0 flex-col border-b border-border bg-background">
            <div className="flex min-h-16 items-center gap-2 px-4 py-4">
              <SidebarTrigger className="-ml-1" />
              <span className="mr-2 flex h-4 items-center">
                <Separator
                  orientation="vertical"
                  className="data-[orientation=vertical]:h-full"
                />
              </span>
              <PortalBreadcrumbs
                isHome={isHome}
                items={resolvedBreadcrumbItems}
              />
              <div className="ml-auto flex items-center gap-2">
                <TopBarTools />
                <AccountMenu
                  initials={getUserInitials(displayName)}
                  name={displayName}
                  detail={userEmail}
                >
                  <DropdownMenuGroup>
                    <DropdownMenuItem asChild>
                      <Link to="/portal/perfil">
                        <User aria-hidden="true" />
                        Perfil
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </AccountMenu>
              </div>
            </div>
          </header>

          {/* A column down to the bottom edge, so a screen can grow to fill
                it. */}
          <main
            id="contenido-principal"
            className="flex flex-1 flex-col px-4 py-6"
          >
            <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6">
              {children}
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </>
  );
}

export function getPortalBreadcrumbItems(
  matches: UIMatch[],
): PortalShellBreadcrumbItem[] {
  return matches.flatMap((match) => {
    const handle = match.handle as PortalRouteHandle | undefined;

    return (handle?.portalBreadcrumbs ?? []).flatMap((breadcrumb) => {
      if (typeof breadcrumb === "function") {
        return breadcrumb(match) ?? [];
      }

      return breadcrumb;
    });
  });
}

function PortalBreadcrumbs({
  isHome,
  items,
}: {
  isHome: boolean;
  items: PortalShellBreadcrumbItem[];
}) {
  return (
    <Breadcrumb className="flex items-center">
      <BreadcrumbList>
        <BreadcrumbItem>
          {isHome ? (
            <BreadcrumbPage>Inicio</BreadcrumbPage>
          ) : (
            <BreadcrumbLink asChild>
              <Link to="/portal">Inicio</Link>
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>
        {isHome ? null : <PortalBreadcrumbSegments items={items} />}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function PortalBreadcrumbSegments({
  items,
}: {
  items: PortalShellBreadcrumbItem[];
}) {
  return items.map((item, index) => {
    const isCurrent = index === items.length - 1;

    return (
      <PortalBreadcrumbSegment
        key={`${item.label}-${index}`}
        item={item}
        isCurrent={isCurrent}
      />
    );
  });
}

function PortalBreadcrumbSegment({
  item,
  isCurrent,
}: {
  item: PortalShellBreadcrumbItem;
  isCurrent: boolean;
}) {
  return (
    <>
      <BreadcrumbSeparator />
      <BreadcrumbItem>
        {item.to && !isCurrent ? (
          <BreadcrumbLink asChild>
            <Link to={item.to}>{item.label}</Link>
          </BreadcrumbLink>
        ) : (
          <BreadcrumbPage>{item.label}</BreadcrumbPage>
        )}
      </BreadcrumbItem>
    </>
  );
}

function PortalActiveEventSummary({
  eventContext,
}: {
  eventContext: PortalShellEventContext;
}) {
  const activeEventName = eventContext.activeEvent?.name ?? "Sin evento";
  const eventStatusLabel = eventContext.activeEvent
    ? eventStatusLabels[eventContext.eventStatus]
    : noActiveEventLabel;

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg">
            <EnEscenaAvatar />
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{activeEventName}</span>
              <span className="truncate text-xs">{eventStatusLabel}</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      {eventContext.isRegistrationOpen ? null : (
        <p className="px-2 text-xs text-muted-foreground">
          Las inscripciones están cerradas.
        </p>
      )}
    </>
  );
}

function getPortalContactDisplayName(
  contactName: string | null,
  userEmail: string,
) {
  const trimmedName = contactName?.trim();

  if (trimmedName && trimmedName !== userEmail) {
    return trimmedName;
  }

  return userEmail;
}

function getUserInitials(value: string) {
  const parts = value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return "EE";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
