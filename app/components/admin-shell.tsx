import type { ReactNode } from "react";
import { ChevronRight, Home, LogOut, MailPlus, Settings } from "lucide-react";
import { Link, NavLink, useLocation } from "react-router";
import { clsx } from "clsx";

import type { AdminEventOption } from "@/lib/admin-event-context.shared";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

type AdminShellProps = {
  email: string;
  events: AdminEventOption[];
  selectedEventId: string | null;
  title: string;
  children: ReactNode;
  showEventSelector?: boolean;
};

const settingsNavigationItems = [
  {
    label: "Eventos",
    to: "/administracion/ajustes/eventos",
  },
  {
    label: "Modalidades",
    to: "/administracion/ajustes/modalidades",
  },
  {
    label: "Categorías",
    to: "/administracion/ajustes/categorias",
  },
  {
    label: "Bloques horarios",
    to: "/administracion/ajustes/bloques-horarios",
  },
  {
    label: "Precios",
    to: "/administracion/ajustes/precios",
  },
] satisfies Array<{
  label: string;
  to: string;
}>;

const primaryNavigationItems = [
  {
    label: "Inicio",
    to: "/administracion",
    icon: Home,
  },
  {
    label: "Invitaciones",
    to: "/administracion/usuarios/invitaciones",
    icon: MailPlus,
  },
];

export function AdminShell({
  email,
  events,
  selectedEventId,
  title,
  children,
  showEventSelector = true,
}: AdminShellProps) {
  const location = useLocation();
  const selectedEvent =
    events.find((event) => event.id === selectedEventId) ?? null;
  const showMissingActiveEvent = showEventSelector && !selectedEvent;
  const showLimitedOperation =
    showEventSelector && selectedEvent !== null && !selectedEvent.active;
  const settingsOpen = location.pathname.startsWith("/administracion/ajustes");

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
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" asChild>
                  <Link to="/administracion">
                    <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                      EE
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">En Escena</span>
                      <span className="truncate text-xs">
                        Panel de administración
                      </span>
                    </div>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
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
                        isActive={location.pathname === item.to}
                      >
                        <NavLink to={item.to}>
                          <Icon aria-hidden="true" />
                          <span>{item.label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}

                <Collapsible asChild defaultOpen={settingsOpen}>
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        className="group/settings-trigger"
                        tooltip="Ajustes"
                      >
                        <Settings aria-hidden="true" />
                        <span>Ajustes</span>
                        <ChevronRight
                          aria-hidden="true"
                          className="ml-auto transition-transform group-data-[state=open]/settings-trigger:rotate-90"
                        />
                        <span className="sr-only">
                          Alternar secciones de Ajustes
                        </span>
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {settingsNavigationItems.map((item) => (
                          <SidebarMenuSubItem key={item.to}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={location.pathname.startsWith(item.to)}
                            >
                              <NavLink
                                to={appendSelectedEventId(
                                  item.to,
                                  selectedEventId,
                                )}
                              >
                                <span>{item.label}</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <form action="/salir" method="post">
                  <SidebarMenuButton asChild>
                    <button type="submit">
                      <LogOut aria-hidden="true" />
                      <span>Salir</span>
                    </button>
                  </SidebarMenuButton>
                </form>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset>
          <header className="flex shrink-0 flex-col border-b border-border bg-background">
            <div className="flex min-h-16 flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <SidebarTrigger className="-ml-1" />
                  <Separator
                    orientation="vertical"
                    className="mr-2 data-[orientation=vertical]:h-4"
                  />
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Panel de administración
                  </p>
                </div>
                <h1 className="mt-1 text-2xl font-semibold text-foreground">
                  {title}
                </h1>
              </div>
              <div className="text-sm leading-5 text-muted-foreground">
                Sesión activa para{" "}
                <span className="break-words font-medium text-foreground">
                  {email}
                </span>
              </div>
            </div>

            {showEventSelector ? (
              <div className="flex flex-col gap-3 border-t border-border px-4 py-4 lg:flex-row lg:items-end lg:justify-between">
                <form method="get" className="max-w-sm">
                  <label
                    htmlFor="admin-evento-trabajo"
                    className="block text-sm font-medium text-foreground"
                  >
                    Evento de trabajo
                  </label>
                  <select
                    id="admin-evento-trabajo"
                    name="evento"
                    value={selectedEventId ?? ""}
                    onChange={(event) =>
                      event.currentTarget.form?.requestSubmit()
                    }
                    className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-ring"
                  >
                    {events.length === 0 ? (
                      <option value="">No hay eventos creados</option>
                    ) : null}
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.name}
                        {event.active ? " (activo)" : ""}
                      </option>
                    ))}
                  </select>
                </form>

                {showMissingActiveEvent ? (
                  <AdminShellBanner tone="warning">
                    No hay evento activo.
                  </AdminShellBanner>
                ) : null}
                {showLimitedOperation ? (
                  <AdminShellBanner tone="info">
                    Estás editando un Evento de trabajo que no es el Evento
                    activo.
                  </AdminShellBanner>
                ) : null}
              </div>
            ) : null}
          </header>

          <main id="contenido-principal" className="flex-1 px-4 py-6">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </>
  );
}

function appendSelectedEventId(path: string, selectedEventId: string | null) {
  if (!selectedEventId) {
    return path;
  }

  return `${path}?evento=${encodeURIComponent(selectedEventId)}`;
}

type AdminShellBannerProps = {
  children: ReactNode;
  tone: "info" | "warning";
};

function AdminShellBanner({ children, tone }: AdminShellBannerProps) {
  return (
    <p
      className={clsx(
        "rounded-lg border px-4 py-3 text-sm leading-5",
        tone === "info" && "border-sky-200 bg-sky-50 text-sky-900",
        tone === "warning" && "border-amber-200 bg-amber-50 text-amber-900",
      )}
    >
      {children}
    </p>
  );
}
