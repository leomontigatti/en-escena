import { useState } from "react";

import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

import { PeriodExportDialog } from "./dialog";

/**
 * A list's actions menu as the auditor sees it: one `Exportar` entry, which
 * opens the period dialog. The list renders it only for whoever cannot write;
 * the exports are the auditor's alone for now.
 */
export function PeriodExportMenu({
  description,
  path,
  title,
}: {
  description: string;
  path: string;
  title: string;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <>
      <ResourceActionsMenu contentClassName="w-48">
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            setIsDialogOpen(true);
          }}
        >
          Exportar
        </DropdownMenuItem>
      </ResourceActionsMenu>
      <PeriodExportDialog
        description={description}
        onOpenChange={setIsDialogOpen}
        open={isDialogOpen}
        path={path}
        title={title}
      />
    </>
  );
}
