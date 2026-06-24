import type { ComponentProps, ReactNode } from "react";
import {
  AudioLines,
  ChevronsUpDown,
  CircleCheck,
  GraduationCap,
  Home,
  Inbox,
  Info,
  LogOut,
  TriangleAlert,
  User,
  Users,
} from "lucide-react";
import { Link, NavLink, useLocation, type UIMatch } from "react-router";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EnEscenaAvatar } from "@/components/shared/en-escena-avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type {
  PortalEventContext,
  PortalShellEventContext,
} from "@/lib/portal/event-context";
import { getPortalEventStatusLabel } from "@/lib/portal/route-state";

type PortalShellProps = {
  userEmail: string;
  contactName: string | null;
  academyName: string;
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

type PortalListPageProps = {
  titleId: string;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  children: ReactNode;
};

export function PortalListPage({
  titleId,
  title,
  description,
  action,
  children,
}: PortalListPageProps) {
  return (
    <section className="flex flex-col gap-6" aria-labelledby={titleId}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-xl font-semibold">
            {title}
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
        {action}
      </header>

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

type CoreographyCreationState = {
  tone: "ready" | "blocked" | "info";
  message: string;
  details: string[];
};

type AlertVariant = NonNullable<ComponentProps<typeof Alert>["variant"]>;
type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>;
type CreationAvailabilityPresentation = {
  alertVariant: AlertVariant;
  badgeLabel: string;
  badgeVariant: BadgeVariant;
  Icon: typeof CircleCheck;
};
type EventStatusPresentation = {
  label: string;
  variant: BadgeVariant;
};

const portalNavigationItems = [
  { to: "/portal", label: "Inicio", icon: Home },
  { to: "/portal/profesores", label: "Profesores", icon: GraduationCap },
  { to: "/portal/bailarines", label: "Bailarines", icon: Users },
  { to: "/portal/coreografias", label: "Coreografías", icon: AudioLines },
] as const;

const creationAvailabilityPresentationByTone: Record<
  CoreographyCreationState["tone"],
  CreationAvailabilityPresentation
> = {
  ready: {
    alertVariant: "success",
    badgeLabel: "Disponible",
    badgeVariant: "success",
    Icon: CircleCheck,
  },
  blocked: {
    alertVariant: "warning",
    badgeLabel: "Bloqueado",
    badgeVariant: "warning",
    Icon: TriangleAlert,
  },
  info: {
    alertVariant: "info",
    badgeLabel: "Información",
    badgeVariant: "info",
    Icon: Info,
  },
};

export function PortalShell({
  userEmail,
  contactName,
  academyName,
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
            <SidebarGroup>
              <SidebarGroupLabel>Portal</SidebarGroupLabel>
              <SidebarMenu>
                {portalNavigationItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        tooltip={item.label}
                        isActive={isNavigationItemActive(
                          location.pathname,
                          item.to,
                        )}
                      >
                        <NavLink to={item.to}>
                          <Icon aria-hidden="true" />
                          <span>{item.label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton size="lg">
                      <Avatar className="rounded-lg after:rounded-lg">
                        <AvatarFallback className="rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                          {getUserInitials(displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-medium">
                          {displayName}
                        </span>
                        <span className="truncate text-xs">{academyName}</span>
                      </div>
                      <ChevronsUpDown aria-hidden="true" />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="top"
                    align="end"
                    className="w-(--radix-dropdown-menu-trigger-width)"
                  >
                    <DropdownMenuGroup>
                      <DropdownMenuItem asChild>
                        <Link to="/portal/perfil">
                          <User aria-hidden="true" />
                          Perfil
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <form action="/salir" method="post">
                        <DropdownMenuItem asChild variant="destructive">
                          <button type="submit" className="w-full">
                            <LogOut aria-hidden="true" />
                            Salir
                          </button>
                        </DropdownMenuItem>
                      </form>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
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
            </div>
          </header>

          <main id="contenido-principal" className="flex-1 px-4 py-6">
            <div className="mx-auto flex max-w-6xl flex-col gap-6">
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

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg">
          <EnEscenaAvatar />
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{activeEventName}</span>
            <span className="truncate text-xs">Portal de academias</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

type PortalEmptyListProps = {
  title: string;
  description: string;
};

export function PortalEmptyList({ title, description }: PortalEmptyListProps) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription className="leading-6">{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

type PortalEmptyListSectionProps = {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
};

export function PortalEmptyListSection({
  title,
  description,
  emptyTitle,
  emptyDescription,
}: PortalEmptyListSectionProps) {
  const titleId = `${title.toLowerCase()}-title`;

  return (
    <section className="mt-8" aria-labelledby={titleId}>
      <div>
        <p id={titleId} className="text-sm font-semibold text-foreground">
          {title}
        </p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      <PortalEmptyList title={emptyTitle} description={emptyDescription} />
    </section>
  );
}

export function PortalCoreographiesSection({
  eventContext,
}: {
  eventContext: PortalEventContext;
}) {
  const selectedEvent = eventContext.selectedEvent;
  const creationAvailability = getCoreographyCreationState(eventContext);
  const eventStatus = getPortalEventStatus(eventContext.isReadOnly);
  const creationAvailabilityPresentation =
    creationAvailabilityPresentationByTone[creationAvailability.tone];

  return (
    <section className="mt-8" aria-labelledby="coreografias-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p
            id="coreografias-title"
            className="text-sm font-semibold text-foreground"
          >
            Coreografías
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Esta sección muestra información específica del Evento activo.
          </p>
        </div>
      </div>

      <Card className="mt-4">
        {selectedEvent ? (
          <>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-col gap-2">
                <CardTitle>{selectedEvent.name}</CardTitle>
                <CardDescription className="leading-6">
                  No hay coreografías registradas para este evento.
                </CardDescription>
              </div>
              <Badge variant={eventStatus.variant}>{eventStatus.label}</Badge>
            </CardHeader>
            <CardContent>
              <Alert variant={creationAvailabilityPresentation.alertVariant}>
                <creationAvailabilityPresentation.Icon aria-hidden="true" />
                <AlertTitle className="flex flex-wrap items-center gap-2">
                  <span>{creationAvailability.message}</span>
                  <Badge
                    variant={creationAvailabilityPresentation.badgeVariant}
                  >
                    {creationAvailabilityPresentation.badgeLabel}
                  </Badge>
                </AlertTitle>
                {creationAvailability.details.length > 0 ? (
                  <AlertDescription>
                    <ul className="mt-2 flex flex-col gap-1">
                      {creationAvailability.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                ) : null}
              </Alert>
            </CardContent>
          </>
        ) : (
          <CardHeader>
            <CardTitle>Todavía no hay Eventos configurados</CardTitle>
            <CardDescription className="leading-6">
              Cuando administración cree un Evento, vas a poder consultarlo
              desde esta sección. La gestión de profesores y bailarines sigue
              disponible como información de la academia.
            </CardDescription>
          </CardHeader>
        )}
      </Card>
    </section>
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

function isNavigationItemActive(pathname: string, to: string) {
  if (to === "/portal") {
    return pathname === to;
  }

  return pathname === to || pathname.startsWith(`${to}/`);
}

function getPortalEventStatus(isReadOnly: boolean): EventStatusPresentation {
  if (isReadOnly) {
    return {
      label: getPortalEventStatusLabel(true),
      variant: "secondary",
    };
  }

  return {
    label: getPortalEventStatusLabel(false),
    variant: "default",
  };
}

function getCoreographyCreationState(
  eventContext: PortalEventContext,
): CoreographyCreationState {
  if (!eventContext.hasActiveEvent) {
    return {
      tone: "blocked",
      message: "Todavía no hay un Evento activo para registrar coreografías.",
      details: [],
    };
  }

  const activeEventReadiness = eventContext.activeEventRegistrationReadiness;

  if (activeEventReadiness?.isReady === false) {
    return {
      tone: "blocked",
      message:
        "El Evento activo todavía no tiene la configuración mínima para registrar coreografías.",
      details: [],
    };
  }

  const canCreateCoreographies =
    eventContext.selectedEvent !== null &&
    !eventContext.isReadOnly &&
    eventContext.isRegistrationOpen &&
    activeEventReadiness?.isReady === true;

  if (canCreateCoreographies) {
    return {
      tone: "ready",
      message:
        "La creación de coreografías va a estar disponible para este Evento mientras la inscripción esté abierta.",
      details: [],
    };
  }

  return {
    tone: "info",
    message:
      "La creación de coreografías va a estar disponible cuando exista un Evento activo y la inscripción esté abierta.",
    details: [],
  };
}
