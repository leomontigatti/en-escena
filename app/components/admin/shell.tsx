import type { ReactNode } from "react";
import {
  CalendarDays,
  ChevronsUpDown,
  Building2,
  FileText,
  GraduationCap,
  Home,
  LogOut,
  Settings,
  Users,
  AudioLines,
  Clock,
  DollarSign,
  Music2,
  ClipboardList,
  HandCoins,
} from "lucide-react";
import { Link, useLocation, type UIMatch } from "react-router";

import type { AdminEventOption } from "@/lib/admin/event-context.shared";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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
  children?: ReactNode;
  breadcrumbItems?: AdminShellBreadcrumbItem[];
  showEventSelector?: boolean;
};

export type AdminShellBreadcrumbItem = {
  label: string;
  to?: string;
};

type AdminRouteMatch = Partial<Pick<UIMatch, "data" | "handle">> &
  Pick<UIMatch, "params">;

type AdminBreadcrumbFactory = (
  match: AdminRouteMatch,
) => AdminShellBreadcrumbItem | null;

export type AdminShellOptions = {
  showEventSelector?: boolean;
};

export type AdminRouteHandle = {
  adminBreadcrumbs?: Array<AdminShellBreadcrumbItem | AdminBreadcrumbFactory>;
  adminShell?: AdminShellOptions;
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
    label: "Cronogramas",
    to: "/administracion/cronogramas",
    icon: Clock,
  },
  {
    label: "Precios",
    to: "/administracion/precios",
    icon: DollarSign,
  },
] satisfies SidebarNavigationItem[];

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
    label: "Coreografías",
    to: "/administracion/coreografias",
    icon: Music2,
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
] satisfies SidebarNavigationItem[];

const secondaryNavigationItems = [
  {
    label: "Usuarios",
    to: "/administracion/usuarios",
    icon: Users,
  },
  {
    label: "Academias",
    to: "/administracion/academias",
    icon: Building2,
  },
] satisfies SidebarNavigationItem[];

const financeNavigationItems = [
  {
    label: "Resumen",
    to: "/administracion/finanzas",
    icon: ClipboardList,
  },
  {
    label: "Pagos",
    to: "/administracion/pagos",
    icon: HandCoins,
  },
  {
    label: "Facturas",
    to: "/administracion/facturas",
    icon: FileText,
    disabled: true,
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
    label: "Bases",
    items: eventBaseNavigationItems,
  },
  {
    items: secondaryNavigationItems,
  },
] satisfies SidebarNavigationGroup[];

export function AdminShell({
  email,
  events,
  selectedEventId,
  children,
  breadcrumbItems,
  showEventSelector = true,
}: AdminShellProps) {
  const location = useLocation();
  const isHome = location.pathname === "/administracion";
  const resolvedBreadcrumbItems = breadcrumbItems ?? [];

  return (
    <>
      <a
        href="#contenido-principal"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-background focus-visible:px-4 focus-visible:py-3 focus-visible:text-sm focus-visible:font-semibold focus-visible:text-foreground focus-visible:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
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
            <SidebarNavigationGroups
              groups={navigationGroups}
              rootPath="/administracion"
            />
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

export function getAdminBreadcrumbItems(
  matches: AdminRouteMatch[],
): AdminShellBreadcrumbItem[] {
  return matches.flatMap((match) => {
    const handle = match.handle as AdminRouteHandle | undefined;

    return (handle?.adminBreadcrumbs ?? []).flatMap((breadcrumb) => {
      if (typeof breadcrumb === "function") {
        return breadcrumb(match) ?? [];
      }

      return breadcrumb;
    });
  });
}

export function getAdminShellOptions(
  matches: AdminRouteMatch[],
): AdminShellOptions {
  return matches.reduce<AdminShellOptions>((resolvedOptions, match) => {
    const handle = match.handle as AdminRouteHandle | undefined;

    return {
      ...resolvedOptions,
      ...handle?.adminShell,
    };
  }, {});
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
          <EnEscenaAvatar />
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

function AdminBrandLink() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" asChild>
          <Link to="/administracion">
            <EnEscenaAvatar />
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
