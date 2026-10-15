import { Form, useNavigation } from "react-router";

import {
  AccessHeader,
  AccessPage,
  AccessTextLink,
} from "@/components/auth/access-ui";
import { AccessTextField, useAccessForm } from "@/components/auth/access-form";
import { SelectField } from "@/components/shared/select-field";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { PUBLIC_ONBOARDING_PATH } from "@/lib/auth/access-paths.shared";
import { authToastIds } from "@/lib/auth/access-form.shared";
import { isPublicAccessFormSubmitting } from "@/lib/auth/public-access-route.shared";
import {
  emptyIndividualPersonalDataValues,
  individualPersonalDataSchema,
  type IndividualPersonalDataValues,
} from "@/lib/individuals/personal-data";
import { documentTypeOptions } from "@/lib/roster/identity-document";
import { argentinePhonePlaceholder } from "@/lib/shared/argentine-phone";
import type { UnexpectedActionError } from "@/lib/shared/recoverable-client-action";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { IndividualOnboardingActionData } from "./shared";

/** The individual's onboarding form, the step after choosing `Particular`. */
export function IndividualOnboardingRouteView({
  actionData,
}: {
  actionData:
    IndividualOnboardingActionData | UnexpectedActionError | undefined;
}) {
  const navigation = useNavigation();
  const isSubmitting = isPublicAccessFormSubmitting(navigation);
  const form = useAccessForm<IndividualPersonalDataValues>({
    schema: individualPersonalDataSchema,
    values:
      actionData && "values" in actionData
        ? actionData.values
        : emptyIndividualPersonalDataValues,
  });

  useServerActionToast(actionData, {
    toastId: authToastIds.registrationError,
  });

  return (
    <AccessPage width="lg">
      <AccessHeader
        eyebrow="Particular"
        title="Completá tus datos"
        description="Una cuenta es de una sola persona, con su documento. Si la abrís para un menor, cargá sus datos y abrí otra cuenta, con otro correo, para cada uno."
      />

      <Form
        method="post"
        noValidate
        className="mt-8"
        onSubmit={form.handleSubmit}
      >
        <FieldGroup>
          <AccessTextField
            autoComplete="given-name"
            controller={form}
            label="Nombre"
            name="firstName"
          />

          <AccessTextField
            autoComplete="family-name"
            controller={form}
            label="Apellido"
            name="lastName"
          />

          <SelectField
            control={form.form.control}
            label="Tipo de documento"
            name="documentType"
            options={documentTypeOptions}
            placeholder="Elegí un tipo"
          />

          <AccessTextField
            controller={form}
            label="Número de documento"
            name="documentNumber"
          />

          <AccessTextField
            autoComplete="tel"
            controller={form}
            inputMode="tel"
            label="Teléfono"
            maxLength={10}
            name="phone"
            placeholder={argentinePhonePlaceholder}
            type="tel"
          />

          <Button className="w-full" type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <Spinner aria-hidden="true" data-icon="inline-start" />
            ) : null}
            Crear cuenta
          </Button>
        </FieldGroup>
      </Form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        ¿Es para una academia?{" "}
        <AccessTextLink to={PUBLIC_ONBOARDING_PATH}>
          Elegir otro tipo de cuenta
        </AccessTextLink>
      </p>
    </AccessPage>
  );
}
