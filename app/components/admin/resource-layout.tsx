import { Inbox, Plus, Settings, type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";
import { Link } from "react-router";

import { AdminShell } from "@/components/admin/shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { AdminEventContext } from "@/lib/admin/event-context.server";

export type EventBaseAreaKey =
  | "categorias"
  | "modalidades"
  | "bloques-horarios"
  | "precios";

export type AdminResourceBreadcrumbItem = {
  label: string;
  to?: string;
};

type AdminResourceShellData = {
  email: string;
  events: AdminEventContext["events"];
  selectedEventId: string | null;
};

type AdminResourceLayoutViewProps = {
  loaderData: AdminResourceShellData;
  children: ReactNode;
};

type AdminActionError = {
  message: string;
};

type AdminResourceLayoutProps = {
  actionData?: AdminActionError;
  action?: {
    label: string;
    to: string;
  };
  breadcrumbItems?: AdminResourceBreadcrumbItem[];
  children: ReactNode;
  description: string;
  headerAction?: ReactNode;
  loaderData: AdminResourceShellData;
  requireSelectedEvent?: boolean;
  title: string;
};

type AdminEmptyStateProps = {
  description: string;
  icon?: LucideIcon;
  title: string;
};

export const eventBaseAreas: Array<{
  key: EventBaseAreaKey;
  label: string;
}> = [
  {
    key: "modalidades",
    label: "Modalidades",
  },
  {
    key: "categorias",
    label: "Categorías",
  },
  {
    key: "bloques-horarios",
    label: "Bloques horarios",
  },
  {
    key: "precios",
    label: "Precios",
  },
];

export function EventBasesLayoutView({
  loaderData,
  children,
}: AdminResourceLayoutViewProps) {
  return (
    <AdminShell
      email={loaderData.email}
      events={loaderData.events}
      selectedEventId={loaderData.selectedEventId}
      title="Bases del evento"
    >
      {children}
    </AdminShell>
  );
}

export function AdminResourceLayout({
  action,
  breadcrumbItems,
  loaderData,
  actionData,
  headerAction,
  requireSelectedEvent = true,
  title,
  description,
  children,
}: AdminResourceLayoutProps) {
  return (
    <AdminShell
      email={loaderData.email}
      events={loaderData.events}
      selectedEventId={loaderData.selectedEventId}
      title={title}
      breadcrumbItems={breadcrumbItems}
    >
      {requireSelectedEvent && !loaderData.selectedEventId ? (
        <AdminEventRequiredEmptyState />
      ) : (
        <div className="flex flex-col gap-6">
          <AdminResourceHeader
            title={title}
            description={description}
            action={action}
            headerAction={headerAction}
          />
          <ActionErrorBanner actionData={actionData} />
          {children}
        </div>
      )}
    </AdminShell>
  );
}

export function AdminEventRequiredEmptyState() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Settings aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>Elegí un evento activo para editar sus bases</EmptyTitle>
        <EmptyDescription>
          Activá un evento para editar modalidades, categorías, bloques horarios
          y precios.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function AdminEmptyState({
  description,
  icon: Icon = Inbox,
  title,
}: AdminEmptyStateProps) {
  return (
    <Empty className="min-h-48">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function buildEventBasePath(
  area: EventBaseAreaKey | null,
  selectedEventId: string | null,
) {
  return appendSelectedEventId(
    area ? `/administracion/${area}` : "/administracion/eventos",
    selectedEventId,
  );
}

function AdminResourceHeader({
  action,
  headerAction,
  title,
  description,
}: {
  action?: {
    label: string;
    to: string;
  };
  headerAction?: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      {headerAction ??
        (action ? (
          <Button asChild>
            <Link to={action.to}>
              <Plus aria-hidden="true" data-icon />
              {action.label}
            </Link>
          </Button>
        ) : null)}
    </header>
  );
}

function ActionErrorBanner({ actionData }: { actionData?: AdminActionError }) {
  if (!actionData) {
    return null;
  }

  return (
    <Alert variant="destructive">
      <AlertDescription>{actionData.message}</AlertDescription>
    </Alert>
  );
}

function appendSelectedEventId(
  pathname: string,
  _selectedEventId: string | null,
) {
  return pathname;
}
