import type { ReactNode } from "react";
import {
  AudioLines,
  CalendarDays,
  ChevronsUpDown,
  GraduationCap,
  Home,
  LogOut,
  User,
  Users,
} from "lucide-react";
import { Link, NavLink, useLocation } from "react-router";
import { clsx } from "clsx";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import type { PortalEventContext } from "@/lib/portal/event-context";
import { getPortalEventStatusLabel } from "@/lib/portal/route-state";

type PortalShellProps = {
  userEmail: string;
  userName: string | null;
  academyName: string;
  eventContext: PortalEventContext;
  title: string;
  children: ReactNode;
  breadcrumbItems?: PortalShellBreadcrumbItem[];
};

type PortalShellBreadcrumbItem = {
  label: string;
  to?: string;
};

type CoreographyCreationState = {
  tone: "ready" | "blocked" | "info";
  message: string;
  details: string[];
};

const portalNavigationItems = [
  { to: "/portal", label: "Inicio", icon: Home },
  { to: "/portal/profesores", label: "Profesores", icon: GraduationCap },
  { to: "/portal/bailarines", label: "Bailarines", icon: Users },
  { to: "/portal/coreografias", label: "Coreografías", icon: AudioLines },
] as const;

const creationAvailabilityToneClassNames: Record<
  CoreographyCreationState["tone"],
  string
> = {
  ready: "bg-emerald-50 text-emerald-900",
  blocked: "bg-amber-50 text-amber-900",
  info: "bg-slate-50 text-slate-700",
};

export function PortalShell({
  userEmail,
  userName,
  academyName,
  eventContext,
  title,
  children,
  breadcrumbItems,
}: PortalShellProps) {
  const location = useLocation();
  const isHome = location.pathname === "/portal";
  const resolvedBreadcrumbItems = breadcrumbItems ?? [{ label: title }];
  const displayName = getPortalUserDisplayName(userName, userEmail);

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
                    <DropdownMenuLabel>Sesión</DropdownMenuLabel>
                    <DropdownMenuGroup>
                      <DropdownMenuItem disabled>
                        <User aria-hidden="true" />
                        Perfil
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
                  {isHome
                    ? null
                    : resolvedBreadcrumbItems.map((item, index) => {
                        const isCurrent =
                          index === resolvedBreadcrumbItems.length - 1;

                        return (
                          <PortalBreadcrumbSegment
                            key={`${item.label}-${index}`}
                            item={item}
                            isCurrent={isCurrent}
                          />
                        );
                      })}
                </BreadcrumbList>
              </Breadcrumb>
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
  eventContext: PortalEventContext;
}) {
  const activeEventName = eventContext.activeEvent?.name ?? "Sin evento";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg">
          <Avatar className="rounded-lg after:rounded-lg">
            <AvatarFallback className="rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <CalendarDays aria-hidden="true" />
            </AvatarFallback>
          </Avatar>
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
    <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </div>
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
        <p id={titleId} className="text-sm font-semibold text-slate-950">
          {title}
        </p>
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
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

  return (
    <section className="mt-8" aria-labelledby="coreografias-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p
            id="coreografias-title"
            className="text-sm font-semibold text-slate-950"
          >
            Coreografías
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Esta sección muestra información específica del Evento activo.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-5">
        {selectedEvent ? (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  {selectedEvent.name}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  No hay coreografías registradas para este evento.
                </p>
              </div>
              <span className={eventStatus.className}>{eventStatus.label}</span>
            </div>
            <div
              className={clsx(
                "mt-4 rounded-lg px-4 py-3 text-sm leading-6",
                creationAvailabilityToneClassNames[creationAvailability.tone],
              )}
            >
              <p>{creationAvailability.message}</p>
              {creationAvailability.details.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {creationAvailability.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </>
        ) : (
          <div>
            <h2 className="text-base font-semibold text-slate-950">
              Todavía no hay Eventos configurados
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Cuando administración cree un Evento, vas a poder consultarlo
              desde esta sección. La gestión de profesores y bailarines sigue
              disponible como información de la academia.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function getPortalUserDisplayName(userName: string | null, userEmail: string) {
  const trimmedName = userName?.trim();

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

function getPortalEventStatus(isReadOnly: boolean) {
  if (isReadOnly) {
    return {
      label: getPortalEventStatusLabel(true),
      className:
        "inline-flex w-fit rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800",
    };
  }

  return {
    label: getPortalEventStatusLabel(false),
    className:
      "inline-flex w-fit rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800",
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
