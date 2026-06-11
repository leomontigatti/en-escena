import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link, redirect } from "react-router";

import { AdminShell } from "@/components/admin-shell";
import { Badge } from "@/components/ui/badge";
import {
  adminProfessorNotFoundMessage,
  formatAdminProfessorDocument,
  getAdminProfessorParticipationLabel,
  getAdminProfessorParticipationSummary,
  type AdminProfessorParticipationStatus,
} from "@/lib/admin-professors.shared";
import { loadAdminEventContext } from "@/lib/admin-event-context.server";
import { findAdministrativeProfessor } from "@/lib/admin-professors.server";
import { requireInternalUser } from "@/lib/internal-access.server";

import type { Route } from "./+types/administracion_.profesores_.$professorId";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type AdministracionProfesorDetalleRouteProps = {
  loaderData: LoaderData;
};

const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});

export const meta: Route.MetaFunction = () => [
  { title: "Profesor | Panel de administración | En Escena" },
];

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const professorId = params.professorId;

  if (!professorId) {
    throw new Response(adminProfessorNotFoundMessage, { status: 404 });
  }

  const professor = await findAdministrativeProfessor({
    professorId,
    selectedEventId: eventContext.selectedEventId,
  });

  if (!professor) {
    throw new Response(adminProfessorNotFoundMessage, { status: 404 });
  }

  return {
    email: user.email,
    eventOptions: eventContext.events,
    selectedEventId: eventContext.selectedEventId,
    professor,
    backToList: buildBackToListHref(request.url),
  };
}

export function AdministracionProfesorDetalleRouteView({
  loaderData,
}: AdministracionProfesorDetalleRouteProps) {
  return (
    <AdminShell
      email={loaderData.email}
      events={loaderData.eventOptions}
      selectedEventId={loaderData.selectedEventId}
      title="Profesor"
    >
      <section className="space-y-6">
        <Link
          to={loaderData.backToList}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Volver a Profesores
        </Link>

        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-slate-950">
              {loaderData.professor.lastName}, {loaderData.professor.firstName}
            </h2>
            <Badge
              variant={loaderData.professor.active ? "default" : "secondary"}
            >
              {loaderData.professor.active ? "Activo" : "Archivado"}
            </Badge>
            <ParticipationBadge
              participationStatus={loaderData.professor.participationStatus}
            />
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Ficha administrativa de solo lectura para soporte y auditoría.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <ReadOnlyCard title="Identidad">
            <DetailRow label="Nombre">
              {loaderData.professor.firstName}
            </DetailRow>
            <DetailRow label="Apellido">
              {loaderData.professor.lastName}
            </DetailRow>
            <DetailRow label="Documento">
              {formatAdminProfessorDocument(loaderData.professor)}
            </DetailRow>
          </ReadOnlyCard>

          <ReadOnlyCard title="Academia">
            <DetailRow label="Academia">
              {loaderData.professor.academy.name}
            </DetailRow>
            <DetailRow label="Contacto">
              {loaderData.professor.academy.contactName}
            </DetailRow>
            <DetailRow label="Email">
              {loaderData.professor.academy.email}
            </DetailRow>
            <DetailRow label="Teléfono">
              {loaderData.professor.academy.phone}
            </DetailRow>
          </ReadOnlyCard>
        </div>

        <ReadOnlyCard title="Participación">
          <DetailRow label="Evento de trabajo">
            {getAdminProfessorParticipationSummary(
              loaderData.professor.participationStatus,
            )}
          </DetailRow>
          {loaderData.professor.choreographyNames.length > 0 ? (
            <DetailRow label="Coreografías">
              <ul className="space-y-1">
                {loaderData.professor.choreographyNames.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </DetailRow>
          ) : null}
        </ReadOnlyCard>

        <ReadOnlyCard title="Trazabilidad">
          <DetailRow label="Creado">
            {dateTimeFormatter.format(loaderData.professor.createdAt)}
          </DetailRow>
          <DetailRow label="Actualizado">
            {dateTimeFormatter.format(loaderData.professor.updatedAt)}
          </DetailRow>
        </ReadOnlyCard>
      </section>
    </AdminShell>
  );
}

export default function AdministracionProfesorDetalleRoute({
  loaderData,
}: AdministracionProfesorDetalleRouteProps) {
  return <AdministracionProfesorDetalleRouteView loaderData={loaderData} />;
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
  participationStatus: AdminProfessorParticipationStatus;
}) {
  const variant =
    participationStatus === "participating" ? "outline" : "secondary";

  return (
    <Badge variant={variant}>
      {getAdminProfessorParticipationLabel(participationStatus)}
    </Badge>
  );
}

function buildBackToListHref(requestUrl: string) {
  const url = new URL(requestUrl);
  const searchParams = new URLSearchParams(url.search);

  searchParams.delete("guardado");
  const search = searchParams.toString();

  return `/administracion/profesores${search.length > 0 ? `?${search}` : ""}`;
}
