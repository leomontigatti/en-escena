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

type AdminResourceLayoutSelectedEvent = {
  selectedEventId: string | null;
};

type AdminEventRequiredEmptyStateCopy = {
  description: string;
  title: string;
};

type AdminResourceLayoutProps = {
  action?: {
    label: string;
    to: string;
  };
  children: ReactNode;
  description: string;
  eventRequiredEmptyState?: AdminEventRequiredEmptyStateCopy;
  headerAction?: ReactNode;
  loaderData?: AdminResourceLayoutSelectedEvent;
  requireSelectedEvent?: boolean;
  selectedEventId?: string | null;
  title: string;
};

type AdminEmptyStateProps = {
  description: string;
  icon?: LucideIcon;
  title: string;
};

export function AdminResourceLayout({
  action,
  headerAction,
  loaderData,
  requireSelectedEvent = true,
  selectedEventId = null,
  title,
  description,
  children,
  eventRequiredEmptyState,
}: AdminResourceLayoutProps) {
  const resolvedSelectedEventId =
    selectedEventId ?? loaderData?.selectedEventId ?? null;

  return requireSelectedEvent && !resolvedSelectedEventId ? (
    <AdminEventRequiredEmptyState copy={eventRequiredEmptyState} />
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

const defaultAdminEventRequiredEmptyStateCopy = {
  title: "Elegí un evento activo para editar sus bases",
  description:
    "Activá un evento para editar modalidades, categorías, cronogramas y precios.",
} satisfies AdminEventRequiredEmptyStateCopy;

function AdminEventRequiredEmptyState({
  copy = defaultAdminEventRequiredEmptyStateCopy,
}: {
  copy?: AdminEventRequiredEmptyStateCopy;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Settings aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{copy.title}</EmptyTitle>
        <EmptyDescription>{copy.description}</EmptyDescription>
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
