import { zodResolver } from "@hookform/resolvers/zod";
import { Info, ListOrdered } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useSubmit } from "react-router";

import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { IrreversibleActionAlert } from "@/components/shared/irreversible-action-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field";
import { formatScheduleDayTabLabel } from "@/lib/choreographies/schedule-formatters";
import { createValidatedReactRouterSubmitHandler } from "@/lib/shared/forms";
import { formatSpanishList } from "@/lib/shared/text-normalization";

import { DayChoices } from "./day-choices";
import {
  automaticOrderingSchema,
  orderAutomaticallyIntent,
  orderDayFieldName,
  type AutomaticOrderingFormValues,
} from "./shared";

/**
 * The automatic ordering, in two steps: the days it covers, then the
 * confirmation the destructive action always asks for. No day chosen is the
 * whole event, which is also all an event of one day can ask, so that event
 * opens straight on the confirmation. Backing out of the confirmation returns
 * to the days with the choice kept; the choice itself changes nothing until it
 * is confirmed, so leaving the first step asks nothing.
 *
 * `Ordenar` closes both at once: the ordering stays on the list and its answer
 * is the route's toast, so a dialog left open would sit a second `Ordenar` in
 * front of an order already written. Mounted only while open, so each opening
 * starts from no day chosen.
 */
export function AutomaticOrderingDialogs({
  days,
  frozenDays,
  onClose,
}: {
  /** The event's days with a choreography, in date order. */
  days: string[];
  /** The days holding a presentation the ordering leaves in place. */
  frozenDays: string[];
  onClose: () => void;
}) {
  const formId = useId();
  const submit = useSubmit();
  const form = useForm<AutomaticOrderingFormValues>({
    defaultValues: { [orderDayFieldName]: [] },
    resolver: zodResolver(automaticOrderingSchema),
  });
  const chosenDays = useWatch({
    control: form.control,
    name: orderDayFieldName,
  });
  const asksForDays = days.length > 1;
  const [step, setStep] = useState<"days" | "confirmation">(
    asksForDays ? "days" : "confirmation",
  );
  // The verb closes the confirmation too, and that close is not a way back.
  const isConfirmed = useRef(false);
  const orderedDays = chosenDays.length > 0 ? chosenDays : days;

  return (
    <>
      {asksForDays ? (
        <Dialog
          open={step === "days"}
          onOpenChange={(open) => {
            if (!open) {
              onClose();
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ordenar automáticamente</DialogTitle>
              <DialogDescription>
                Elegí los días a ordenar. Los demás días mantienen su orden.
              </DialogDescription>
            </DialogHeader>
            <Controller
              control={form.control}
              name={orderDayFieldName}
              render={({ field }) => (
                <FieldSet>
                  <FieldLegend variant="label">Días</FieldLegend>
                  <FieldDescription>
                    Sin días elegidos, se ordena todo el evento.
                  </FieldDescription>
                  <DayChoices
                    days={days}
                    onChange={field.onChange}
                    value={field.value}
                  />
                </FieldSet>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => setStep("confirmation")}>
                Continuar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      <ConfirmationDialog
        className="sm:max-w-lg"
        confirmIcon={ListOrdered}
        confirmLabel="Ordenar"
        description={`Las coreografías elegibles ${describeOrderedDays(chosenDays)} se ordenan por defecto y se les asigna un número de presentación nuevo.`}
        destructive
        form={formId}
        onConfirm={() => {
          isConfirmed.current = true;
          onClose();
        }}
        onOpenChange={(open) => {
          if (open || isConfirmed.current) {
            return;
          }

          if (asksForDays) {
            setStep("days");
          } else {
            onClose();
          }
        }}
        open={step === "confirmation"}
        title="¿Ordenar las presentaciones?"
      >
        {orderedDays.some((day) => frozenDays.includes(day)) ? (
          <Alert variant="info">
            <Info aria-hidden="true" />
            <AlertTitle>Presentaciones fijas</AlertTitle>
            <AlertDescription>
              Las presentaciones de un cronograma ya evaluado no cambian de
              número.
            </AlertDescription>
          </Alert>
        ) : null}
        <IrreversibleActionAlert>
          Esta acción es irreversible y modifica cualquier orden manual
          realizado.
        </IrreversibleActionAlert>
        <form
          id={formId}
          method="post"
          noValidate
          onSubmit={createValidatedReactRouterSubmitHandler(form, submit, {
            method: "post",
          })}
        >
          <input type="hidden" name="intent" value={orderAutomaticallyIntent} />
        </form>
      </ConfirmationDialog>
    </>
  );
}

/** "de todo el evento", "del sábado 5/12", "de los días viernes 4/12 y …". */
function describeOrderedDays(days: string[]) {
  if (days.length === 0) {
    return "de todo el evento";
  }

  const named = formatSpanishList(
    days.map((day) => formatScheduleDayTabLabel(day).toLowerCase()),
  );

  return days.length === 1 ? `del ${named}` : `de los días ${named}`;
}
