import { Inbox, Plus, Settings, type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export type EventBaseAreaKey =
  | "categorias"
  | "modalidades"
  | "bloques-horarios"
  | "precios";

type AdminResourceLayoutViewProps = {
  children: ReactNode;
};

type AdminResourceLayoutProps = {
  action?: {
    label: string;
    to: string;
  };
  children: ReactNode;
  description: string;
  headerAction?: ReactNode;
  requireSelectedEvent?: boolean;
  selectedEventId?: string | null;
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
  children,
}: AdminResourceLayoutViewProps) {
  return <>{children}</>;
}

export function AdminResourceLayout({
  action,
  headerAction,
  requireSelectedEvent = true,
  selectedEventId = null,
  title,
  description,
  children,
}: AdminResourceLayoutProps) {
  return requireSelectedEvent && !selectedEventId ? (
    <AdminEventRequiredEmptyState />
  ) : (
    <div className="flex flex-col gap-6">
      <AdminResourceHeader
        title={title}
        description={description}
        action={action}
        headerAction={headerAction}
      />
      {children}
    </div>
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

function appendSelectedEventId(
  pathname: string,
  _selectedEventId: string | null,
) {
  return pathname;
}
