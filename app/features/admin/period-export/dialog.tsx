import { zodResolver } from "@hookform/resolvers/zod";
import { Download } from "lucide-react";
import { useForm } from "react-hook-form";

import { DateOnlyField } from "@/components/shared/date-only-field";
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
import { FieldGroup } from "@/components/ui/field";

import {
  buildPeriodExportHref,
  exportPeriodSchema,
  periodFromParam,
  periodToParam,
  type ExportPeriodFormValues,
} from "./shared";

/**
 * Picks the period an auditor export holds and starts the download in place:
 * the answer is an attachment, so the list stays where it is. Both dates are
 * optional, and leaving both empty downloads the whole event.
 */
export function PeriodExportDialog({
  description,
  onOpenChange,
  open,
  path,
  title,
}: {
  description: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** Where the download lives; the period travels in its query. */
  path: string;
  title: string;
}) {
  const form = useForm<ExportPeriodFormValues>({
    defaultValues: { [periodFromParam]: "", [periodToParam]: "" },
    resolver: zodResolver(exportPeriodSchema),
  });

  const download = form.handleSubmit((values) => {
    window.open(
      buildPeriodExportHref(path, {
        from: values[periodFromParam] || null,
        to: values[periodToParam] || null,
      }),
      "_self",
    );
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
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <DateOnlyField
              clearable
              control={form.control}
              label="Desde"
              name={periodFromParam}
              placeholder="Desde el inicio"
            />
            <DateOnlyField
              clearable
              control={form.control}
              label="Hasta"
              name={periodToParam}
              placeholder="Hasta hoy"
            />
          </FieldGroup>

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
