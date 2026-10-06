import { useWatch } from "react-hook-form";

import type { EventFormController } from "@/components/admin/events/form";
import { TextInputField } from "@/components/shared/text-input-field";
import { TextareaField } from "@/components/shared/textarea-field";
import { FieldGroup } from "@/components/ui/field";
import { PAYMENT_INSTRUCTIONS_TEXT_MAX_LENGTH } from "@/lib/admin/events/form-values";
import { cn } from "@/lib/shared/utils";

/**
 * The event's bank identifiers and how-to-pay text, in the same two-column grid
 * the event fields use. A field of the event form like any other: no form of
 * its own, no button of its own — the card's single "Guardar" saves them.
 */
export function EventPaymentInstructionsFields({
  controller,
}: {
  controller: EventFormController;
}) {
  const { form } = controller;
  const text = useWatch({
    control: form.control,
    name: "paymentInstructionsText",
  });
  // The count the schema measures, and the count the column stores: both trim
  // first, so a trailing newline never paints the counter destructive over a
  // text the save would have accepted. The counter shows the cap live; the
  // field's own error waits for the submit, as every field's does.
  const length = text?.trim().length ?? 0;
  const isTooLong = length > PAYMENT_INSTRUCTIONS_TEXT_MAX_LENGTH;
  return (
    <FieldGroup className="grid gap-5 md:grid-cols-2">
      <TextInputField
        control={form.control}
        label="CBU/CVU"
        name="paymentInstructionsCbu"
        autoComplete="off"
        inputMode="numeric"
        placeholder="22 dígitos"
      />
      <TextInputField
        control={form.control}
        label="Alias"
        name="paymentInstructionsAlias"
        autoComplete="off"
        placeholder="En minúscula y sin espacios"
      />
      <TextInputField
        control={form.control}
        label="Titular"
        name="paymentInstructionsHolderName"
        autoComplete="off"
      />
      <TextInputField
        control={form.control}
        label="Banco"
        name="paymentInstructionsBankName"
        autoComplete="off"
      />
      <TextInputField
        control={form.control}
        label="CUIT del titular"
        name="paymentInstructionsHolderCuit"
        autoComplete="off"
        placeholder="11 dígitos, con o sin guiones"
      />
      {/* The CUIT ends the identifier grid alone; the spacer keeps the textarea
          on its own row on wide screens. */}
      <div aria-hidden="true" className="hidden md:block" />
      <TextareaField
        control={form.control}
        className="md:col-span-2"
        label="Cómo pagar"
        name="paymentInstructionsText"
        rows={6}
        // The bold hint and the counter ride the existing description slot, under the control:
        // no new component, no new token.
        description={
          // `FieldDescription` sets its own muted colour, so the field's
          // `data-invalid` never reaches the counter — it names the number that
          // is over the cap, so it is told separately.
          <span className="flex justify-between gap-4">
            <span>Escribí **texto** para mostrarlo en negrita.</span>
            <span
              className={cn(
                "shrink-0 whitespace-nowrap tabular-nums",
                isTooLong && "text-destructive",
              )}
            >
              {length} / {PAYMENT_INSTRUCTIONS_TEXT_MAX_LENGTH}
            </span>
          </span>
        }
        placeholder="Poné el nombre de tu academia en la referencia de la transferencia."
      />
    </FieldGroup>
  );
}
