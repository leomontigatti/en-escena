import { useNavigation, useSubmit } from "react-router";

import { PortalPageHeader } from "@/components/portal/ui";
import { FormActions } from "@/components/shared/form-actions";
import { useRosterRefusalToast } from "@/components/shared/roster-document-conflict";
import { RosterNameWarningDialog } from "@/components/shared/roster-name-warning";
import { Card, CardContent } from "@/components/ui/card";
import { useLastRefusedValues } from "@/lib/shared/forms";
import type { UnexpectedActionError } from "@/lib/shared/recoverable-client-action";
import {
  PortalProfessorIdentityFields,
  usePortalProfessorForm,
} from "@/features/portal/professors/detail/form";
import { getPortalProfessorDocumentConflict } from "@/features/portal/professors/detail/shared";

import { emptyProfessorValues, type CreateProfessorActionData } from "./shared";

const createProfessorFormId = "portal-profesor-nuevo-form";

/**
 * The detail's identification fields on a page of their own. A refusal comes
 * back to the page with what was typed; a save leaves for the list.
 */
export function CreateProfessorPage({
  actionData,
}: {
  actionData?: CreateProfessorActionData | UnexpectedActionError;
}) {
  const refusal =
    actionData !== undefined && "values" in actionData ? actionData : undefined;
  const refusedValues = useLastRefusedValues(refusal?.values);
  const submit = useSubmit();
  const navigation = useNavigation();
  const form = usePortalProfessorForm({
    savedValues: emptyProfessorValues,
    submit,
    values: refusedValues ?? emptyProfessorValues,
  });
  // Still pending while a save redirects to the list, so the leave guard
  // does not ask about the form it just saved.
  const isSubmitting =
    navigation.state !== "idle" && navigation.formData !== undefined;

  useRosterRefusalToast({
    conflict: getPortalProfessorDocumentConflict(refusal),
    refusal: actionData?.status === "error" ? actionData : null,
    toastId: "portal-profesor-nuevo:error",
  });

  return (
    <section
      aria-labelledby="new-professor-title"
      className="flex flex-1 flex-col gap-6"
    >
      <PortalPageHeader
        titleId="new-professor-title"
        title="Nuevo profesor"
        description="Cargá sus datos; el documento podés completarlo más adelante."
      />

      <Card className="overflow-clip">
        <CardContent>
          <form
            id={createProfessorFormId}
            method="post"
            noValidate
            onSubmit={form.handleSubmit}
          >
            <PortalProfessorIdentityFields form={form.form} />
          </form>
        </CardContent>
        <FormActions
          backTo="/portal/profesores"
          form={createProfessorFormId}
          hasChanges={form.form.formState.isDirty}
          isPending={isSubmitting}
          onDiscard={form.discard}
        />
      </Card>

      {refusal?.status === "warning" ? (
        <RosterNameWarningDialog
          formId={createProfessorFormId}
          isPending={isSubmitting}
          warning={refusal.warning}
        />
      ) : null}
    </section>
  );
}
