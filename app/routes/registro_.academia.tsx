import { Form, redirect, useActionData, useNavigation } from "react-router";
import { z } from "zod";

import { AcademyNameWarningDialog } from "@/components/auth/academy-name-warning";
import { AccessHeader, AccessPage } from "@/components/auth/access-ui";
import { AccessTextField, useAccessForm } from "@/components/auth/access-form";
import { SelectField } from "@/components/shared/select-field";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import {
  completeAcademyOnboarding,
  requireAcademyOnboardingUser,
} from "@/lib/academies/onboarding.server";
import { provinceField, provinceOptions } from "@/lib/academies/provinces";
import {
  authToastIds,
  readFormValue,
  requiredTextField,
} from "@/lib/auth/access-form.shared";
import {
  argentinePhoneField,
  argentinePhonePlaceholder,
} from "@/lib/shared/argentine-phone";
import {
  getEmptyFieldErrors,
  getFieldErrors,
} from "@/lib/shared/form-validation";
import { isPublicAccessFormSubmitting } from "@/lib/auth/public-access-route.shared";
import { readAcknowledgedDuplicateIds } from "@/lib/shared/duplicate-warning";
import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { Route } from "./+types/registro_.academia";

const academyOnboardingSchema = z.object({
  academyName: requiredTextField(),
  contactName: requiredTextField(),
  phone: argentinePhoneField(),
  province: provinceField(),
  city: requiredTextField(),
});
const academyOnboardingFields = [
  "academyName",
  "contactName",
  "phone",
  "province",
  "city",
] as const;
type AcademyOnboardingField = (typeof academyOnboardingFields)[number];
type AcademyOnboardingValues = z.input<typeof academyOnboardingSchema>;

const emptyAcademyOnboardingValues: AcademyOnboardingValues = {
  academyName: "",
  contactName: "",
  phone: "",
  province: "",
  city: "",
};

export const meta: Route.MetaFunction = () => [
  { title: "Completar academia | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  await requireAcademyOnboardingUser(request);

  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const values = {
    academyName: readFormValue(formData.get("academyName")),
    contactName: readFormValue(formData.get("contactName")),
    phone: readFormValue(formData.get("phone")),
    province: readFormValue(formData.get("province")),
    city: readFormValue(formData.get("city")),
  } satisfies AcademyOnboardingValues;
  const parsed = academyOnboardingSchema.safeParse({
    academyName: formData.get("academyName"),
    contactName: formData.get("contactName"),
    phone: formData.get("phone"),
    province: formData.get("province"),
    city: formData.get("city"),
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Revisá los campos marcados.",
      fieldErrors: getFieldErrors(parsed.error, academyOnboardingFields),
      values,
    };
  }

  const result = await completeAcademyOnboarding({
    academyName: parsed.data.academyName,
    acknowledgedDuplicateIds: readAcknowledgedDuplicateIds(formData),
    city: parsed.data.city,
    contactName: parsed.data.contactName,
    phone: parsed.data.phone,
    province: parsed.data.province,
    request,
  });

  if (!result.ok && "warning" in result) {
    return {
      status: "warning" as const,
      values,
      warning: result.warning,
    };
  }

  if (!result.ok) {
    return {
      status: "error" as const,
      message: result.error,
      fieldErrors: getEmptyFieldErrors<AcademyOnboardingField>(),
      values,
    };
  }

  throw redirect("/portal", { headers: result.headers });
}

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}

const academyOnboardingFormId = "academy-onboarding-form";

export default function AcademyOnboardingRoute() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const form = useAccessForm({
    schema: academyOnboardingSchema,
    values: actionData?.values ?? emptyAcademyOnboardingValues,
  });

  const warning =
    actionData && "warning" in actionData ? actionData.warning : null;

  // The duplicate-name warning is carried by the dialog alone, so the
  // warning answer is kept out of the toast.
  const toastData =
    actionData && actionData.status !== "warning" ? actionData : null;

  useServerActionToast(toastData, {
    toastId: authToastIds.registrationError,
  });

  return (
    <AccessPage width="lg">
      <AccessHeader
        eyebrow="Portal de academias"
        title="Completá los datos de tu academia"
        description="Tu correo ya quedó confirmado. Ahora cargá los datos de la academia para entrar al portal."
      />

      <Form
        id={academyOnboardingFormId}
        method="post"
        noValidate
        className="mt-8"
        onSubmit={form.handleSubmit}
      >
        <FieldGroup>
          <AccessTextField
            autoComplete="organization"
            controller={form}
            label="Nombre de la academia"
            name="academyName"
          />

          <AccessTextField
            autoComplete="name"
            controller={form}
            label="Nombre de contacto"
            name="contactName"
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

          <SelectField
            control={form.form.control}
            label="Provincia"
            name="province"
            options={provinceOptions}
            placeholder="Elegí una provincia"
          />

          <AccessTextField
            autoComplete="address-level2"
            controller={form}
            label="Ciudad"
            name="city"
          />

          <Button className="w-full" type="submit">
            Crear academia
          </Button>
        </FieldGroup>
      </Form>

      {warning ? (
        <AcademyNameWarningDialog
          formId={academyOnboardingFormId}
          isPending={isPublicAccessFormSubmitting(navigation)}
          matches={warning.matches}
        />
      ) : null}
    </AccessPage>
  );
}
