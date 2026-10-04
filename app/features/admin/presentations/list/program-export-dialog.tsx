import { zodResolver } from "@hookform/resolvers/zod";
import { Download } from "lucide-react";
import { useForm } from "react-hook-form";

import { SelectField } from "@/components/shared/select-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatScheduleDayTabLabel } from "@/lib/choreographies/schedule-formatters";

import {
  buildProgramExportHref,
  programExportAllDays,
  programExportDayParam,
  programExportSchema,
  type ProgramExportFormValues,
} from "../program-export/shared";

/**
 * Picks what the program spreadsheet holds, the whole event or one day, and
 * starts the download in place: the answer is an attachment, so the list stays
 * where it is. Nothing is chosen up front, so the file is always the one asked for.
 */
export function ProgramExportDialog({
  days,
  onOpenChange,
  open,
}: {
  /** In date order, only the days with numbered presentations. */
  days: string[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const form = useForm<ProgramExportFormValues>({
    defaultValues: { [programExportDayParam]: "" },
    resolver: zodResolver(programExportSchema),
  });

  const download = form.handleSubmit((values) => {
    window.open(buildProgramExportHref(values[programExportDayParam]), "_self");
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Descargar programa</DialogTitle>
          <DialogDescription>
            Elegí el día, o todos. Se descarga una planilla de Excel con las
            presentaciones en su orden.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={download} className="flex flex-col gap-4">
          <SelectField
            control={form.control}
            label="Día"
            name={programExportDayParam}
            options={[
              { label: "Todos", value: programExportAllDays },
              ...days.map((day) => ({
                label: formatScheduleDayTabLabel(day),
                value: day,
              })),
            ]}
            placeholder="Elegí un día"
          />

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit">
              <Download aria-hidden="true" data-icon="inline-start" />
              Descargar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
