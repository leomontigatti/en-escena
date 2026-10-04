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
  buildExportHref,
  exportAllDays,
  exportDayParam,
  exportDaySchema,
  type ExportDayFormValues,
} from "./shared";

/**
 * Picks what a spreadsheet export holds, the whole event or one day, and
 * starts the download in place: the answer is an attachment, so the list stays
 * where it is. Nothing is chosen up front, so the file is always the one asked for.
 */
export function DayExportDialog({
  days,
  description,
  onOpenChange,
  open,
  path,
  title,
}: {
  /** In date order, only the days the export has rows for. */
  days: string[];
  description: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** Where the download lives; the chosen day travels in its query. */
  path: string;
  title: string;
}) {
  const form = useForm<ExportDayFormValues>({
    defaultValues: { [exportDayParam]: "" },
    resolver: zodResolver(exportDaySchema),
  });

  const download = form.handleSubmit((values) => {
    window.open(buildExportHref(path, values[exportDayParam]), "_self");
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={download} className="flex flex-col gap-4">
          <SelectField
            control={form.control}
            label="Día"
            name={exportDayParam}
            options={[
              { label: "Todos", value: exportAllDays },
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
