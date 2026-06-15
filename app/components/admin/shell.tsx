import type { ReactNode } from "react";
import {
  CalendarDays,
  ChevronsUpDown,
  GraduationCap,
  Home,
  LogOut,
  Settings,
  Users,
  AudioLines,
  Clock,
  DollarSign,
} from "lucide-react";
import { Link, NavLink, useLocation } from "react-router";

import type { AdminEventOption } from "@/lib/admin/event-context.shared";
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

type AdminShellProps = {
  email: string;
  events: AdminEventOption[];
  selectedEventId: string | null;
  title: string;
  children: ReactNode;
  breadcrumbItems?: AdminShellBreadcrumbItem[];
  showEventSelector?: boolean;
};

type AdminShellBreadcrumbItem = {
  label: string;
  to?: string;
};

const eventBaseNavigationItems = [
  {
    label: "Modalidades",
    to: "/administracion/modalidades",
    icon: AudioLines,
  },
  {
    label: "Categorías",
    to: "/administracion/categorias",
    icon: Settings,
  },
  {
    label: "Bloques horarios",
    to: "/administracion/bloques-horarios",
    icon: Clock,
  },
  {
    label: "Precios",
    to: "/administracion/precios",
    icon: DollarSign,
  },
] satisfies Array<{
  label: string;
  to: string;
  icon: typeof Home;
}>;

const primaryNavigationItems = [
  {
    label: "Inicio",
    to: "/administracion",
    icon: Home,
  },
  {
    label: "Eventos",
    to: "/administracion/eventos",
    icon: CalendarDays,
  },
  {
    label: "Profesores",
    to: "/administracion/profesores",
    icon: GraduationCap,
  },
  {
    label: "Bailarines",
    to: "/administracion/bailarines",
    icon: Users,
  },
] satisfies Array<{
  label: string;
  to: string;
  icon: typeof Home;
}>;

const secondaryNavigationItems = [
  {
    label: "Usuarios",
    to: "/administracion/usuarios/nuevo",
    icon: Users,
  },
] satisfies Array<{
  label: string;
  to: string;
  icon: typeof Home;
}>;

export function AdminShell({
  email,
  events,
  selectedEventId,
  title,
  children,
  breadcrumbItems,
  showEventSelector = true,
}: AdminShellProps) {
  const location = useLocation();
  const isHome = location.pathname === "/administracion";
  const resolvedBreadcrumbItems = breadcrumbItems ?? [{ label: title }];

  return (
    <>
      <a
        href="#contenido-principal"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-white focus-visible:px-4 focus-visible:py-3 focus-visible:text-sm focus-visible:font-semibold focus-visible:text-slate-950 focus-visible:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
      >
        Saltar al contenido principal
      </a>
      <SidebarProvider>
        <Sidebar variant="inset">
          <SidebarHeader>
            {showEventSelector ? (
              <AdminActiveEventSummary
                events={events}
                selectedEventId={selectedEventId}
              />
            ) : (
              <AdminBrandLink />
            )}
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Administración</SidebarGroupLabel>
              <SidebarMenu>
                {primaryNavigationItems.map((item) => {
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

            <SidebarGroup>
              <SidebarGroupLabel>Bases del evento</SidebarGroupLabel>
              <SidebarMenu>
                {eventBaseNavigationItems.map((item) => {
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

            <SidebarGroup>
              <SidebarMenu>
                {secondaryNavigationItems.map((item) => {
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
                          {getUserInitials(email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-medium">
                          Usuario interno
                        </span>
                        <span className="truncate text-xs">{email}</span>
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
                      <DropdownMenuItem disabled>{email}</DropdownMenuItem>
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
                        <Link to="/administracion">Inicio</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {isHome
                    ? null
                    : resolvedBreadcrumbItems.map((item, index) => {
                        const isCurrent =
                          index === resolvedBreadcrumbItems.length - 1;

                        return (
                          <BreadcrumbSegment
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
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </>
  );
}

function BreadcrumbSegment({
  item,
  isCurrent,
}: {
  item: AdminShellBreadcrumbItem;
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

type AdminActiveEventSummaryProps = {
  events: AdminEventOption[];
  selectedEventId: string | null;
};

function AdminActiveEventSummary({
  events,
  selectedEventId,
}: AdminActiveEventSummaryProps) {
  const selectedEvent =
    events.find((event) => event.id === selectedEventId) ?? null;
  const selectedEventName = selectedEvent?.name ?? "Sin evento";
  const selectedEventStatus = selectedEvent?.active
    ? "Evento activo"
    : "Sin evento activo";

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
            <span className="truncate font-medium">{selectedEventName}</span>
            <span className="truncate text-xs">{selectedEventStatus}</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function getUserInitials(email: string) {
  return email.slice(0, 2).toUpperCase();
}

function isNavigationItemActive(pathname: string, to: string) {
  if (to === "/administracion") {
    return pathname === to;
  }

  return pathname === to || pathname.startsWith(`${to}/`);
}

function AdminBrandLink() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" asChild>
          <Link to="/administracion">
            <Avatar className="rounded-lg after:rounded-lg">
              <AvatarFallback className="rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                EE
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">En Escena</span>
              <span className="truncate text-xs">Panel de administración</span>
            </div>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
