import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";

import { SubmitButton } from "@/components/shared/action-buttons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ActionData } from "@/lib/admin/events/bases-action.server";
import {
  depositPercentageFormSchema,
  type DepositPercentageFormValues,
} from "@/lib/admin/events/deposit-percentage-form-values";
import {
  MAX_REQUIRED_DEPOSIT_PERCENTAGE,
  MIN_REQUIRED_DEPOSIT_PERCENTAGE,
} from "@/lib/events/deposit-percentage";
import {
  createValidatedRouteSubmitHandler,
  isRouteFormPending,
  useApplyServerFieldErrors,
  useOptionalFormAction,
  useOptionalNavigation,
  useOptionalSubmit,
} from "@/lib/shared/forms";

const depositPercentageIntent = "update-required-deposit-percentage";

export function DepositPercentageForm({
  actionData,
  requiredDepositPercentage,
}: {
  actionData?: ActionData;
  requiredDepositPercentage: number;
}) {
  const form = useForm<DepositPercentageFormValues>({
    defaultValues: {
      requiredDepositPercentage: String(requiredDepositPercentage),
    },
    mode: "onSubmit",
    resolver: zodResolver(depositPercentageFormSchema),
  });
  const formAction = useOptionalFormAction();
  const navigation = useOptionalNavigation();
  const submit = useOptionalSubmit();
  const submittedValues =
    actionData?.scope?.intent === depositPercentageIntent &&
    actionData.values &&
    "requiredDepositPercentage" in actionData.values
      ? actionData.values
      : undefined;
  const fieldErrors =
    actionData?.scope?.intent === depositPercentageIntent
      ? actionData.fieldErrors
      : {};
  const isPending = isRouteFormPending(navigation, {
    intent: depositPercentageIntent,
  });

  useEffect(() => {
    form.reset({
      requiredDepositPercentage:
        submittedValues?.requiredDepositPercentage ??
        String(requiredDepositPercentage),
    });
  }, [
    form,
    requiredDepositPercentage,
    submittedValues?.requiredDepositPercentage,
  ]);

  useApplyServerFieldErrors(form, fieldErrors);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Seña de coreografía</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          method="post"
          onSubmit={createValidatedRouteSubmitHandler(form, submit, formAction)}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="intent" value={depositPercentageIntent} />
          <FieldGroup className="grid gap-4 md:grid-cols-[minmax(0,16rem)_auto]">
            <Controller
              control={form.control}
              name="requiredDepositPercentage"
              render={({ field, fieldState }) => (
                <Field
                  className="max-w-xs"
                  data-invalid={fieldState.error ? true : undefined}
                >
                  <FieldLabel htmlFor="requiredDepositPercentage">
                    Seña de coreografía (%)
                  </FieldLabel>
                  <Input
                    {...field}
                    id="requiredDepositPercentage"
                    name="requiredDepositPercentage"
                    type="number"
                    min={MIN_REQUIRED_DEPOSIT_PERCENTAGE}
                    max={MAX_REQUIRED_DEPOSIT_PERCENTAGE}
                    step="1"
                    autoComplete="off"
                    aria-invalid={fieldState.error ? true : undefined}
                  />
                  <FieldDescription>
                    Se usa para calcular las futuras facturas de seña del evento
                    activo.
                  </FieldDescription>
                  <FieldError>{fieldState.error?.message}</FieldError>
                </Field>
              )}
            />
            <div className="flex items-end">
              <SubmitButton isPending={isPending} />
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
