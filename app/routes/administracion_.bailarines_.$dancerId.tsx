import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link, redirect } from "react-router";

import { AdminShell } from "@/components/admin-shell";
import { Badge } from "@/components/ui/badge";
import {
  adminDancerNotFoundMessage,
  formatAdminDancerBirthDate,
  formatAdminDancerDocument,
  getAdminDancerIdentificationBadgeVariant,
  getAdminDancerIdentificationLabel,
  getAdminDancerParticipationBadgeVariant,
  getAdminDancerParticipationLabel,
  getAdminDancerParticipationSummary,
  type AdminDancerIdentificationStatus,
  type AdminDancerParticipationStatus,
} from "@/lib/admin-dancers.shared";
import { loadAdminEventContext } from "@/lib/admin-event-context.server";
import { findAdministrativeDancer } from "@/lib/admin-dancers.server";
import { requireInternalUser } from "@/lib/internal-access.server";

import type { Route } from "./+types/administracion_.bailarines_.$dancerId";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type AdministracionBailarinDetalleRouteProps = {
  loaderData: LoaderData;
};

const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});

export const meta: Route.MetaFunction = () => [
  { title: "Bailarín | Panel de administración | En Escena" },
];

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const dancerId = params.dancerId;

  if (!dancerId) {
    throw new Response(adminDancerNotFoundMessage, { status: 404 });
  }

  const dancer = await findAdministrativeDancer({
    dancerId,
    selectedEventId: eventContext.selectedEventId,
  });

  if (!dancer) {
    throw new Response(adminDancerNotFoundMessage, { status: 404 });
  }

  return {
    email: user.email,
    eventOptions: eventContext.events,
    selectedEventId: eventContext.selectedEventId,
    dancer,
    backToList: buildBackToListHref(request.url),
  };
}

export function AdministracionBailarinDetalleRouteView({
  loaderData,
}: AdministracionBailarinDetalleRouteProps) {
  return (
    <AdminShell
      email={loaderData.email}
      events={loaderData.eventOptions}
      selectedEventId={loaderData.selectedEventId}
      title="Bailarín"
    >
      <section className="space-y-6">
        <Link
          to={loaderData.backToList}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Volver a Bailarines
        </Link>

        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-slate-950">
              {loaderData.dancer.lastName}, {loaderData.dancer.firstName}
            </h2>
            <Badge variant={loaderData.dancer.active ? "default" : "secondary"}>
              {loaderData.dancer.active ? "Activo" : "Archivado"}
            </Badge>
            <ParticipationBadge
              participationStatus={loaderData.dancer.participationStatus}
            />
            <IdentificationBadge
              identificationStatus={loaderData.dancer.identificationStatus}
            />
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Ficha administrativa de solo lectura para soporte y auditoría.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <ReadOnlyCard title="Identidad">
            <DetailRow label="Nombre">{loaderData.dancer.firstName}</DetailRow>
            <DetailRow label="Apellido">{loaderData.dancer.lastName}</DetailRow>
            <DetailRow label="Fecha de nacimiento">
              {formatAdminDancerBirthDate(loaderData.dancer.birthDate)}
            </DetailRow>
            <DetailRow label="Documento">
              {formatAdminDancerDocument(loaderData.dancer)}
            </DetailRow>
            <DetailRow label="Estado de identificación">
              {getAdminDancerIdentificationLabel(
                loaderData.dancer.identificationStatus,
              )}
            </DetailRow>
          </ReadOnlyCard>

          <ReadOnlyCard title="Academia">
            <DetailRow label="Academia">
              {loaderData.dancer.academy.name}
            </DetailRow>
            <DetailRow label="Contacto">
              {loaderData.dancer.academy.contactName}
            </DetailRow>
            <DetailRow label="Email">
              {loaderData.dancer.academy.email}
            </DetailRow>
            <DetailRow label="Teléfono">
              {loaderData.dancer.academy.phone}
            </DetailRow>
          </ReadOnlyCard>
        </div>

        <ReadOnlyCard title="Participación">
          <DetailRow label="Evento de trabajo">
            {getAdminDancerParticipationSummary(
              loaderData.dancer.participationStatus,
            )}
          </DetailRow>
          {loaderData.dancer.choreographyNames.length > 0 ? (
            <DetailRow label="Coreografías">
              <ul className="space-y-1">
                {loaderData.dancer.choreographyNames.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </DetailRow>
          ) : null}
        </ReadOnlyCard>

        <ReadOnlyCard title="Trazabilidad">
          <DetailRow label="Creado">
            {dateTimeFormatter.format(loaderData.dancer.createdAt)}
          </DetailRow>
          <DetailRow label="Actualizado">
            {dateTimeFormatter.format(loaderData.dancer.updatedAt)}
          </DetailRow>
        </ReadOnlyCard>
      </section>
    </AdminShell>
  );
}

export default function AdministracionBailarinDetalleRoute({
  loaderData,
}: AdministracionBailarinDetalleRouteProps) {
  return <AdministracionBailarinDetalleRouteView loaderData={loaderData} />;
}

function ReadOnlyCard({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-lg border bg-white p-6">
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      <dl className="mt-4 space-y-4">{children}</dl>
    </section>
  );
}

function DetailRow({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div>
      <dt className="text-sm font-medium text-slate-600">{label}</dt>
      <dd className="mt-1 text-sm text-slate-950">{children}</dd>
    </div>
  );
}

function ParticipationBadge({
  participationStatus,
}: {
  participationStatus: AdminDancerParticipationStatus;
}) {
  return (
    <Badge
      variant={getAdminDancerParticipationBadgeVariant(participationStatus)}
    >
      {getAdminDancerParticipationLabel(participationStatus)}
    </Badge>
  );
}

function IdentificationBadge({
  identificationStatus,
}: {
  identificationStatus: AdminDancerIdentificationStatus;
}) {
  return (
    <Badge
      variant={getAdminDancerIdentificationBadgeVariant(identificationStatus)}
    >
      {getAdminDancerIdentificationLabel(identificationStatus)}
    </Badge>
  );
}

function buildBackToListHref(requestUrl: string) {
  const url = new URL(requestUrl);
  const searchParams = new URLSearchParams(url.search);
  const search = searchParams.toString();

  return `/administracion/bailarines${search.length > 0 ? `?${search}` : ""}`;
}
