import { useState } from "react";

import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

import { SeminarExportDialog } from "./dialog";
import type { NamedSeminar } from "./shared";

/**
 * The seminar list's actions menu as the auditor sees it: one `Exportar`
 * entry, which opens the seminar dialog. The list renders it only for whoever
 * cannot write, as the other lists render the period export.
 */
export function SeminarExportMenu({
  seminars,
}: {
  seminars: readonly NamedSeminar[];
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <>
      <ResourceActionsMenu contentClassName="w-48">
        <DropdownMenuItem onSelect={() => setIsDialogOpen(true)}>
          Exportar
        </DropdownMenuItem>
      </ResourceActionsMenu>
      <SeminarExportDialog
        onOpenChange={setIsDialogOpen}
        open={isDialogOpen}
        seminars={seminars}
      />
    </>
  );
}
