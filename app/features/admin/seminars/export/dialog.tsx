import { zodResolver } from "@hookform/resolvers/zod";
import { Download } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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
import { requiredFieldMessage } from "@/lib/shared/forms";

import {
  buildSeminarExportHref,
  exportAllSeminars,
  exportSeminarParam,
  seminarExportLabels,
  type NamedSeminar,
} from "./shared";

const exportSeminarSchema = z.object({
  [exportSeminarParam]: z.string().min(1, requiredFieldMessage),
});

type ExportSeminarFormValues = z.infer<typeof exportSeminarSchema>;

/**
 * Picks what the auditor's seminar spreadsheet holds, every seminar or one,
 * and starts the download in place: the answer is an attachment, so the list
 * stays where it is. Only the seminars with inscriptions are offered, the ones
 * the file has a sheet for; with none, there is nothing to download.
 */
export function SeminarExportDialog({
  onOpenChange,
  open,
  seminars,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** In the list's order, only the seminars with inscriptions. */
  seminars: readonly NamedSeminar[];
}) {
  const form = useForm<ExportSeminarFormValues>({
    defaultValues: { [exportSeminarParam]: exportAllSeminars },
    resolver: zodResolver(exportSeminarSchema),
  });
  const labels = seminarExportLabels(seminars);
  const isEmpty = seminars.length === 0;

  const download = form.handleSubmit((values) => {
    window.open(buildSeminarExportHref(values[exportSeminarParam]), "_self");
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Exportar seminarios</DialogTitle>
          <DialogDescription>
            {isEmpty
              ? "Todavía no hay inscripciones en los seminarios del evento activo, así que no hay nada para exportar."
              : "Elegí un seminario, o todos. Se descarga una planilla de Excel con una hoja por seminario, con sus inscriptos y lo que pagaron."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={download} className="flex flex-col gap-4">
          {isEmpty ? null : (
            <SelectField
              control={form.control}
              label="Seminario"
              name={exportSeminarParam}
              options={[
                { label: "Todos los seminarios", value: exportAllSeminars },
                ...seminars.map((seminar) => ({
                  label: labels.get(seminar.id) ?? seminar.instructorName,
                  value: seminar.id,
                })),
              ]}
              placeholder="Elegí un seminario"
            />
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {isEmpty ? "Cerrar" : "Cancelar"}
              </Button>
            </DialogClose>
            {isEmpty ? null : (
              <Button type="submit">
                <Download aria-hidden="true" data-icon="inline-start" />
                Descargar
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
