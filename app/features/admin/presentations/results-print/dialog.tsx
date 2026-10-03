import { zodResolver } from "@hookform/resolvers/zod";
import { Printer } from "lucide-react";
import { useForm } from "react-hook-form";

import { ChecklistField } from "@/components/shared/checklist-field";
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
import { formatProgramScheduleLabel } from "@/features/program/public/print";
import type { EventProgramSchedule } from "@/lib/presentations/event-program.server";

import {
  buildResultsPrintHref,
  resultsPrintSchema,
  resultsPrintScheduleParam,
  type ResultsPrintFormValues,
} from "./shared";

/**
 * Picks the schedules whose results are printed together, and opens the print
 * in a tab of its own, as the comprobante's print does. Nothing is submitted
 * to the server: the form only validates the choice and builds the address.
 */
export function ResultsPrintDialog({
  onOpenChange,
  open,
  schedules,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** In day and time order, which is the order the print runs in too. */
  schedules: EventProgramSchedule[];
}) {
  const form = useForm<ResultsPrintFormValues>({
    defaultValues: { [resultsPrintScheduleParam]: [] },
    resolver: zodResolver(resultsPrintSchema),
  });

  const print = form.handleSubmit((values) => {
    const chosen = values[resultsPrintScheduleParam];
    // In the order the schedules run, whatever order they were ticked in.
    const ordered = schedules
      .filter((schedule) => chosen.includes(schedule.id))
      .map((schedule) => schedule.id);

    window.open(buildResultsPrintHref(ordered), "_blank", "noopener");
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Imprimir resultados</DialogTitle>
          <DialogDescription>
            Elegí los cronogramas. Cada uno se imprime en sus propias páginas,
            con el promedio y el premio de cada presentación.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={print} className="flex flex-col gap-4">
          <ChecklistField
            control={form.control}
            emptySelectionMessage="Todavía no elegiste ningún cronograma."
            label="Cronogramas"
            name={resultsPrintScheduleParam}
            options={schedules.map((schedule) => ({
              label: formatProgramScheduleLabel(schedule),
              value: schedule.id,
            }))}
            searchLabel="Buscar cronograma"
          />

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit">
              <Printer aria-hidden="true" data-icon="inline-start" />
              Imprimir
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
