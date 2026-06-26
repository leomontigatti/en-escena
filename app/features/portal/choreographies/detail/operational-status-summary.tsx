import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  type ChoreographyOperationalStatus,
  formatChoreographyOperationalPendingItemLabel,
} from "@/lib/choreographies/operational-status";

export function OperationalStatusSummary({
  operationalStatus,
}: {
  operationalStatus: ChoreographyOperationalStatus;
}) {
  const { pendingItems } = operationalStatus;

  if (pendingItems.length === 0) {
    return null;
  }

  return (
    <Alert variant="warning">
      <TriangleAlert aria-hidden="true" />
      <AlertDescription>
        {pendingItems.length === 1 ? "Falta" : "Faltan"} cargar{" "}
        {formatPendingItems(pendingItems)}.
      </AlertDescription>
    </Alert>
  );
}

function formatPendingItems(
  pendingItems: ChoreographyOperationalStatus["pendingItems"],
) {
  return formatList(
    pendingItems.map((pendingItem) => {
      if (pendingItem === "music") {
        return "archivo de música";
      }

      return formatChoreographyOperationalPendingItemLabel(
        pendingItem,
      ).toLowerCase();
    }),
  );
}

function formatList(items: string[]) {
  if (items.length <= 1) {
    return items[0] ?? "";
  }

  return `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;
}
