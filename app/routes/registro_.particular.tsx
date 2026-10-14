import { Form, redirect, useActionData } from "react-router";

import {
  AccessHeader,
  AccessPage,
  AccessTextLink,
} from "@/components/auth/access-ui";
import { AccessTextField, useAccessForm } from "@/components/auth/access-form";
import { SelectField } from "@/components/shared/select-field";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { PUBLIC_ONBOARDING_PATH } from "@/lib/auth/access-paths.shared";
import { authToastIds } from "@/lib/auth/access-form.shared";
import { requirePendingOnboardingUser } from "@/lib/auth/pending-onboarding.server";
import { INDIVIDUAL_AREA_PATH } from "@/lib/auth/user-role.shared";
import { completeIndividualOnboarding } from "@/lib/individuals/onboarding.server";
import {
  emptyIndividualPersonalDataValues,
  individualPersonalDataSchema,
  readIndividualPersonalDataValues,
  type IndividualPersonalDataValues,
} from "@/lib/individuals/personal-data";
import { documentTypeOptions } from "@/lib/roster/identity-document";
import { argentinePhonePlaceholder } from "@/lib/shared/argentine-phone";
import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { Route } from "./+types/registro_.particular";

export const meta: Route.MetaFunction = () => [
  { title: "Completar cuenta de Particular | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  await requirePendingOnboardingUser(request);

  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const values = readIndividualPersonalDataValues(await request.formData());
  const result = await completeIndividualOnboarding({ request, values });

  if (!result.ok) {
    return {
      status: "error" as const,
      message:
        "fieldErrors" in result
          ? "Revisá los datos del formulario."
          : result.error,
      values,
    };
  }

  throw redirect(INDIVIDUAL_AREA_PATH, { headers: result.headers });
}

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}

export default function IndividualOnboardingRoute() {
  const actionData = useActionData<typeof action>();
  const form = useAccessForm<IndividualPersonalDataValues>({
    schema: individualPersonalDataSchema,
    values: actionData?.values ?? emptyIndividualPersonalDataValues,
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

          <Button className="w-full" type="submit">
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
