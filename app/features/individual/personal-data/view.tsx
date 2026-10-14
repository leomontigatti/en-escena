import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { useForm } from "react-hook-form";
import { useNavigation, useSubmit } from "react-router";

import { PortalPageHeader } from "@/components/portal/ui";
import { AlertStack } from "@/components/shared/alert-stack";
import { FormActions } from "@/components/shared/form-actions";
import { ReadOnlyField } from "@/components/shared/read-only-field";
import { SelectField } from "@/components/shared/select-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import type { loadIndividualPersonalData } from "@/features/individual/personal-data/server";
import { INDIVIDUAL_AREA_PATH } from "@/lib/auth/user-role.shared";
import {
  individualPersonalDataSchema,
  type IndividualPersonalDataValues,
} from "@/lib/individuals/personal-data";
import { documentTypeOptions } from "@/lib/roster/identity-document";
import { argentinePhonePlaceholder } from "@/lib/shared/argentine-phone";
import {
  createValidatedRouteSubmitHandler,
  useSavedFormValues,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { IndividualPersonalDataActionData } from "./shared";

const personalDataFormId = "particular-mis-datos-form";

type LoaderData = Awaited<ReturnType<typeof loadIndividualPersonalData>>;

/** Its own result, or the generic failure `recoverableClientAction` returns. */
type PersonalDataActionData =
  IndividualPersonalDataActionData | { status: "error"; message: string };

/**
 * The form against the saved values; after a refused save it shows what was
 * typed, which still reads as changed ({@link useSavedFormValues}).
 */
function usePersonalDataForm(
  savedValues: IndividualPersonalDataValues,
  actionData: PersonalDataActionData | undefined,
) {
  const refusedValues = readRefusedValues(actionData);
  const form = useForm<
    IndividualPersonalDataValues,
    unknown,
    IndividualPersonalDataValues
  >({
    defaultValues: refusedValues ?? savedValues,
    mode: "onSubmit",
    resolver: zodResolver(individualPersonalDataSchema),
  });
  useSavedFormValues(form, savedValues, refusedValues);
  const submit = useSubmit();
  const navigation = useNavigation();

  return {
    discard: () => form.reset(savedValues),
    form,
    handleSubmit: createValidatedRouteSubmitHandler(form, submit),
    isSaving: navigation.state === "submitting",
  };
}

function readRefusedValues(actionData: PersonalDataActionData | undefined) {
  return actionData && "values" in actionData ? actionData.values : undefined;
}

export function IndividualPersonalDataRouteView({
  actionData,
  loaderData,
}: {
  actionData?: PersonalDataActionData;
  loaderData: LoaderData;
}) {
  const { discard, form, handleSubmit, isSaving } = usePersonalDataForm(
    loaderData.values,
    actionData,
  );

  useServerActionToast(actionData, { toastId: "particular-mis-datos" });

  return (
    <section
      aria-labelledby="personal-data-title"
      className="flex flex-1 flex-col gap-6"
    >
      <PortalPageHeader
        titleId="personal-data-title"
        title="Mis datos"
        description="Tus datos personales y tu documento, para que te identifiquen y te contacten."
      />

      <AlertStack>
        <Alert variant="info">
          <Info aria-hidden="true" />
          <AlertTitle>Una cuenta, una persona</AlertTitle>
          <AlertDescription>
            Estos datos son de una sola persona y de su documento. Para cambiar
            el email de acceso, comunicate con nosotros.
          </AlertDescription>
        </Alert>
      </AlertStack>

      <Card className="overflow-clip">
        <CardContent>
          <form
            id={personalDataFormId}
            method="post"
            noValidate
            onSubmit={handleSubmit}
          >
            <FieldGroup className="grid gap-5 md:grid-cols-2">
              <TextInputField
                autoComplete="given-name"
                control={form.control}
                label="Nombre"
                name="firstName"
              />
              <TextInputField
                autoComplete="family-name"
                control={form.control}
                label="Apellido"
                name="lastName"
              />
              <SelectField
                control={form.control}
                label="Tipo de documento"
                name="documentType"
                options={documentTypeOptions}
                placeholder="Elegí un tipo"
              />
              <TextInputField
                control={form.control}
                label="Número de documento"
                name="documentNumber"
              />
              <TextInputField
                autoComplete="tel"
                control={form.control}
                inputMode="tel"
                label="Teléfono"
                maxLength={10}
                name="phone"
                placeholder={argentinePhonePlaceholder}
                type="tel"
              />
              <ReadOnlyField
                autoComplete="email"
                label="Email de acceso"
                type="email"
                value={loaderData.email}
              />
            </FieldGroup>
          </form>
        </CardContent>
        <FormActions
          backTo={INDIVIDUAL_AREA_PATH}
          form={personalDataFormId}
          hasChanges={form.formState.isDirty}
          isPending={isSaving}
          onDiscard={discard}
        />
      </Card>
    </section>
  );
}
