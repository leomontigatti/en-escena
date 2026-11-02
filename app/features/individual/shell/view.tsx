import type { ReactNode } from "react";
import {
  AudioLines,
  HandCoins,
  Presentation,
  User,
  WalletCards,
} from "lucide-react";
import {
  Link,
  Outlet,
  useLocation,
  useMatches,
  useRouteLoaderData,
} from "react-router";

import { AccountMenu } from "@/components/shared/account-menu";
import { EnEscenaAvatar } from "@/components/shared/en-escena-avatar";
import { ErrorPanel, ErrorScreen } from "@/components/shared/error-panel";
import {
  SidebarNavigationGroups,
  type SidebarNavigationGroup,
} from "@/components/shared/sidebar-navigation";
import { TopBarTools } from "@/components/shared/top-bar-tools";
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
import type { loadIndividualShell } from "@/features/individual/shell/server";
import { individualFinancesPath } from "@/features/individual/finances/shared";
import { individualMovementsPath } from "@/features/individual/payments/shared";
import { individualSeminarsPath } from "@/features/individual/seminars/shared";
import { INDIVIDUAL_AREA_PATH } from "@/lib/auth/user-role.shared";

export const individualProfilePath = `${INDIVIDUAL_AREA_PATH}/perfil`;
const individualChoreographiesPath = `${INDIVIDUAL_AREA_PATH}/coreografias`;

/** A screen of the area names its breadcrumb after `Inicio`. */
export type IndividualRouteHandle = { individualBreadcrumb: string };

type IndividualShellLoaderData = Awaited<
  ReturnType<typeof loadIndividualShell>
>;

const navigationGroups = [
  {
    label: "Evento",
    items: [
      {
        label: "Coreografías",
        to: individualChoreographiesPath,
        icon: AudioLines,
      },
      {
        label: "Seminarios",
        to: individualSeminarsPath,
        icon: Presentation,
      },
    ],
  },
  {
    label: "Finanzas",
    items: [
      {
        label: "Seminarios",
        to: individualFinancesPath,
        icon: WalletCards,
      },
      { label: "Movimientos", to: individualMovementsPath, icon: HandCoins },
    ],
  },
  {
    label: "Cuenta",
    items: [{ label: "Perfil", to: individualProfilePath, icon: User }],
  },
] satisfies SidebarNavigationGroup[];

/**
 * The individual's own area (ADR-0004, ADR-0019): its own layout and menu,
 * built from the shared sidebar and account menu, never the portal's.
 */
function IndividualShell({
  children,
  loaderData,
}: {
  children: ReactNode;
  loaderData: IndividualShellLoaderData;
}) {
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
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg">
                  <EnEscenaAvatar />
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">
                      {loaderData.fullName}
                    </span>
                    <span className="truncate text-xs">Particular</span>
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>

          <SidebarContent>
            <SidebarNavigationGroups
              groups={navigationGroups}
              rootPath={INDIVIDUAL_AREA_PATH}
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
              <IndividualBreadcrumbs />
              <div className="ml-auto flex items-center gap-2">
                <TopBarTools />
                <AccountMenu
                  initials={getInitials(loaderData.fullName)}
                  name={loaderData.fullName}
                  detail={loaderData.email}
                >
                  <DropdownMenuGroup>
                    <DropdownMenuItem asChild>
                      <Link to={individualProfilePath}>
                        <User aria-hidden="true" />
                        Perfil
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </AccountMenu>
              </div>
            </div>
          </header>

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

function IndividualBreadcrumbs() {
  const { pathname } = useLocation();
  const current = useMatches()
    .map(
      (match) =>
        (match.handle as IndividualRouteHandle | undefined)
          ?.individualBreadcrumb,
    )
    .filter((label) => label !== undefined)
    .at(-1);
  const isHome = pathname === INDIVIDUAL_AREA_PATH || current === undefined;

  return (
    <Breadcrumb className="flex items-center">
      <BreadcrumbList>
        <BreadcrumbItem>
          {isHome ? (
            <BreadcrumbPage>Inicio</BreadcrumbPage>
          ) : (
            <BreadcrumbLink asChild>
              <Link to={INDIVIDUAL_AREA_PATH}>Inicio</Link>
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>
        {isHome ? null : (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{current}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function IndividualShellRouteView({
  loaderData,
}: {
  loaderData: IndividualShellLoaderData;
}) {
  return (
    <IndividualShell loaderData={loaderData}>
      <Outlet />
    </IndividualShell>
  );
}

/**
 * A screen's error renders inside the area's layout; when the layout's own
 * loader failed, it takes the whole screen.
 */
export function IndividualShellErrorBoundary({ error }: { error: unknown }) {
  const loaderData =
    useRouteLoaderData<IndividualShellLoaderData>("routes/particular");

  if (!loaderData) {
    return <ErrorScreen error={error} />;
  }

  return (
    <IndividualShell loaderData={loaderData}>
      <ErrorPanel error={error} homeHref={INDIVIDUAL_AREA_PATH} />
    </IndividualShell>
  );
}

function getInitials(fullName: string) {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
