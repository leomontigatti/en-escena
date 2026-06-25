import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  formatOperationalPendingItemLabel,
  type ChoreographyOperationalStatus,
} from "@/lib/portal/choreographies";

export function OperationalStatusSummary({
  operationalStatus,
}: {
  operationalStatus: ChoreographyOperationalStatus;
}) {
  if (operationalStatus.pendingItems.length === 0) {
    return null;
  }

  return (
    <Alert variant="warning">
      <TriangleAlert aria-hidden="true" />
      <AlertDescription>
        {operationalStatus.pendingItems.length === 1 ? "Falta" : "Faltan"}{" "}
        cargar {formatAcademyPendingItems(operationalStatus.pendingItems)}.
      </AlertDescription>
    </Alert>
  );
}

function formatAcademyPendingItems(
  pendingItems: ChoreographyOperationalStatus["pendingItems"],
) {
  return formatList(
    pendingItems.map((pendingItem) => {
      if (pendingItem === "music") {
        return "archivo de música";
      }

      return formatOperationalPendingItemLabel(pendingItem).toLowerCase();
    }),
  );
}

function formatList(items: string[]) {
  if (items.length <= 1) {
    return items[0] ?? "";
  }

  return `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;
}
