import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatChoreographyOperationalStatusLabel,
  getChoreographyOperationalStatusBadgeVariant,
} from "@/lib/choreographies/operational-status";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";

import type { loadAdministrativeChoreographies } from "./server";

type LoaderData = Awaited<ReturnType<typeof loadAdministrativeChoreographies>>;

type AdministracionCoreografiasRouteViewProps = {
  loaderData: LoaderData;
};

export function AdministracionCoreografiasRouteView({
  loaderData,
}: AdministracionCoreografiasRouteViewProps) {
  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Coreografías"
      description="Revisá las coreografías registradas para el evento activo y su estado operativo."
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para revisar coreografías",
        description:
          "Activá un evento para consultar las coreografías registradas por las academias.",
      }}
    >
      {loaderData.choreographies.length > 0 ? (
        <ChoreographyTable loaderData={loaderData} />
      ) : (
        <AdminEmptyState
          title="Todavía no hay coreografías para mostrar."
          description="Cuando las academias registren coreografías para el evento activo, vas a poder revisarlas desde este listado."
        />
      )}
    </AdminResourceLayout>
  );
}

function ChoreographyTable({ loaderData }: { loaderData: LoaderData }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[22%]">Nombre</TableHead>
          <TableHead className="w-[22%]">Academia</TableHead>
          <TableHead className="w-[22%]">Modalidad / Submodalidad</TableHead>
          <TableHead className="w-[22%]">Categoría / Tipo de grupo</TableHead>
          <TableHead className="w-[12%]">Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loaderData.choreographies.map((choreography) => (
          <TableRow key={choreography.id}>
            <TableCell className="font-medium">{choreography.name}</TableCell>
            <TableCell className="text-muted-foreground">
              {choreography.academyName}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatPrimaryAndSecondaryValue(
                choreography.modalityName,
                choreography.submodalityName,
              )}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatPrimaryAndSecondaryValue(
                choreography.categoryName ?? "Sin asignar",
                formatGroupTypeLabel(choreography.groupType),
              )}
            </TableCell>
            <TableCell>
              <Badge
                variant={getChoreographyOperationalStatusBadgeVariant(
                  choreography.operationalStatus,
                )}
              >
                {formatChoreographyOperationalStatusLabel(
                  choreography.operationalStatus,
                )}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function formatPrimaryAndSecondaryValue(
  primaryValue: string,
  secondaryValue: string | null,
) {
  return secondaryValue ? `${primaryValue} · ${secondaryValue}` : primaryValue;
}
