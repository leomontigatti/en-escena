import type { Control, FieldPath, FieldValues } from "react-hook-form";

import { ComboboxField } from "@/components/shared/combobox-field";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { IntegerInputField } from "@/components/shared/integer-input-field";
import { ReadOnlyField } from "@/components/shared/read-only-field";
import { SelectField } from "@/components/shared/select-field";
import { TextareaField } from "@/components/shared/textarea-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { paymentMethodOptions } from "@/features/admin/academies/account-current/shared";

type PaymentFormFieldValues = FieldValues & {
  amount: string;
  internalNote: string;
  paymentDate: string;
  paymentMethod: string;
  reference: string;
};

type PaymentAcademyFieldValues = FieldValues & {
  academyId: string;
};

type PaymentAcademyOption = {
  id: string;
  name: string;
};

export function PaymentAcademyField<TValues extends PaymentAcademyFieldValues>({
  academies,
  control,
  disabled = false,
  value,
}: {
  academies: PaymentAcademyOption[];
  control: Control<TValues>;
  disabled?: boolean;
  value?: string;
}) {
  if (disabled) {
    const selectedAcademy = academies.find((academy) => academy.id === value);

    return (
      <ReadOnlyField
        className="md:col-span-2"
        hiddenValue={value ?? ""}
        label="Academia"
        name="academyId"
        value={selectedAcademy?.name ?? ""}
      />
    );
  }

  return (
    <ComboboxField
      className="md:col-span-2"
      control={control}
      id="academy-id"
      label="Academia"
      name={"academyId" as FieldPath<TValues>}
      options={academies.map((academy) => ({
        value: academy.id,
        label: academy.name,
      }))}
    />
  );
}

export function PaymentFields<TValues extends PaymentFormFieldValues>({
  control,
}: {
  control: Control<TValues>;
}) {
  return (
    <>
      <DateOnlyField
        control={control}
        name={"paymentDate" as FieldPath<TValues>}
        className="md:col-start-1"
        id="payment-date"
        label="Fecha de pago"
      />

      <TextInputField
        className="md:col-start-2"
        control={control}
        id="payment-reference"
        label="Referencia"
        name={"reference" as FieldPath<TValues>}
      />

      <IntegerInputField
        className="md:col-start-1"
        control={control}
        id="payment-amount"
        label="Monto"
        min="1"
        name={"amount" as FieldPath<TValues>}
        step="1"
      />

      <SelectField
        className="md:col-start-2"
        control={control}
        id="payment-method"
        label="Medio de pago"
        name={"paymentMethod" as FieldPath<TValues>}
        options={paymentMethodOptions}
        placeholder="Seleccioná un medio de pago"
      />

      <TextareaField
        className="md:col-span-2"
        control={control}
        id="payment-internalNote"
        label="Nota interna"
        name={"internalNote" as FieldPath<TValues>}
      />
    </>
  );
}
