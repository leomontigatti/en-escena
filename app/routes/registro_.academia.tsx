import { Form, redirect, useActionData } from "react-router";
import { z } from "zod";

import { AccessHeader, AccessPage } from "@/components/auth/access-ui";
import { AccessTextField, useAccessForm } from "@/components/auth/access-form";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import {
  completeAcademyOnboarding,
  requireAcademyOnboardingUser,
} from "@/lib/academies/onboarding.server";
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
import { useServerActionToast } from "@/lib/shared/toasts";
import { withSupabaseSsrHeaders } from "@/lib/auth/supabase-auth-ssr.server";

import type { Route } from "./+types/registro_.academia";

const academyOnboardingSchema = z.object({
  academyName: requiredTextField(),
  contactName: requiredTextField(),
  phone: argentinePhoneField(),
});
const academyOnboardingFields = [
  "academyName",
  "contactName",
  "phone",
] as const;
type AcademyOnboardingField = (typeof academyOnboardingFields)[number];
type AcademyOnboardingValues = {
  academyName: string;
  contactName: string;
  phone: string;
};

const emptyAcademyOnboardingValues: AcademyOnboardingValues = {
  academyName: "",
  contactName: "",
  phone: "",
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
  } satisfies AcademyOnboardingValues;
  const parsed = academyOnboardingSchema.safeParse({
    academyName: formData.get("academyName"),
    contactName: formData.get("contactName"),
    phone: formData.get("phone"),
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
    contactName: parsed.data.contactName,
    phone: parsed.data.phone,
    request,
  });

  if (!result.ok) {
    return {
      status: "error" as const,
      message: result.error,
      fieldErrors: getEmptyFieldErrors<AcademyOnboardingField>(),
      values,
    };
  }

  throw redirect(
    "/portal",
    withSupabaseSsrHeaders({ headers: result.headers }),
  );
}

export default function AcademyOnboardingRoute() {
  const actionData = useActionData<typeof action>();
  const form = useAccessForm({
    schema: academyOnboardingSchema,
    values: actionData?.values ?? emptyAcademyOnboardingValues,
    fieldErrors: actionData?.fieldErrors,
  });

  useServerActionToast(actionData, {
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

          <Button className="w-full" type="submit">
            Crear academia
          </Button>
        </FieldGroup>
      </Form>
    </AccessPage>
  );
}
