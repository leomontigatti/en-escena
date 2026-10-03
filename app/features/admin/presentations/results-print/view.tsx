import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ProgramPrintPages,
  programPrintColumns,
  programPrintWrapClassName,
  type ProgramPrintColumn,
} from "@/features/program/public/print";
import { awardLabels } from "@/lib/judging/award";

import type { ResultsPrintLoaderData } from "./server";
import type { ResultsPrintRow } from "./shared";

/**
 * The program's columns in their `wrapped` layout, narrowed to make room for
 * the two the results add. Most of the room goes to the names, the
 * choreography's and the academy's, which are the ones read out loud.
 */
const resultsPrintColumns: ProgramPrintColumn<ResultsPrintRow>[] = [
  ...programPrintColumns({
    layout: "wrapped",
    widths: {
      orden: 4,
      nombre: 20,
      academia: 17,
      modalidad: 16,
      categoria: 12,
      bailarines: 12,
    },
  }),
  {
    id: "promedio",
    header: "Promedio",
    width: 7,
    className: "font-medium tabular-nums",
    // The average reads the way scores do everywhere: with a point, as stored.
    cell: (row) => String(row.average),
  },
  {
    id: "premio",
    header: "Premio",
    width: 12,
    className: programPrintWrapClassName,
    cell: (row) => awardLabels[row.award],
  },
];

/**
 * The results print, on its own page with no administration chrome: the sheet
 * as it will come out of the printer, and a toolbar above it that does not.
 */
export function ResultsPrintView({
  loaderData,
}: {
  loaderData: ResultsPrintLoaderData;
}) {
  return (
    <main className="min-h-screen bg-background">
      <div className="flex justify-end px-[12mm] pt-6 print:hidden">
        <Button type="button" onClick={() => window.print()}>
          <Printer aria-hidden="true" data-icon="inline-start" />
          Imprimir
        </Button>
      </div>
      {loaderData.schedules.length === 0 ? (
        // Every chosen schedule is still waiting for its results.
        <p className="px-[12mm] py-6 text-center text-muted-foreground">
          Los cronogramas elegidos todavía no tienen resultados.
        </p>
      ) : (
        <ProgramPrintPages
          columns={resultsPrintColumns}
          eventName={loaderData.eventName}
          rows={loaderData.rows}
          schedules={loaderData.schedules}
        />
      )}
    </main>
  );
}
