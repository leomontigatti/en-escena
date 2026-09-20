import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  type ChoreographyMissingPendingItem,
  type ChoreographyOperationalStatus,
  formatChoreographyOperationalPendingItemLabel,
  isChoreographyMissingPendingItem,
} from "@/lib/choreographies/operational-status";

export function OperationalStatusSummary({
  operationalStatus,
}: {
  operationalStatus: ChoreographyOperationalStatus;
}) {
  // Only the missing half of the union is rendered here. The academy is not told
  // about a mis-filed placement — it has no lever to repair one — and the sentence
  // this alert builds could not carry it anyway: nothing is missing.
  const missingItems = operationalStatus.pendingItems.filter(
    isChoreographyMissingPendingItem,
  );

  if (missingItems.length === 0) {
    return null;
  }

  return (
    <Alert variant="warning">
      <TriangleAlert aria-hidden="true" />
      <AlertDescription>
        {missingItems.length === 1 ? "Falta" : "Faltan"} cargar{" "}
        {formatPendingItems(missingItems)}.
      </AlertDescription>
    </Alert>
  );
}

function formatPendingItems(pendingItems: ChoreographyMissingPendingItem[]) {
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
