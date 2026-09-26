import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigation, useSubmit } from "react-router";

import { useMergeDialogState } from "@/features/admin/merge/dialog";
import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { BackButton, SubmitButton } from "@/components/shared/action-buttons";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { ReadOnlyField } from "@/components/shared/read-only-field";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { TextInputField } from "@/components/shared/text-input-field";
import { FieldGroup } from "@/components/ui/field";
import { argentinePhonePlaceholder } from "@/lib/shared/argentine-phone";
import {
  createValidatedRouteSubmitHandler,
  isRouteFormPending,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  academyDetailFormId,
  academyDetailSchema,
  deleteAcademyIntent,
  updateAcademyIntent,
  type AcademyDetailActionData,
  type AcademyDetailFormValues,
  type AcademyDetailLoaderData,
} from "./shared";
import { AcademyMergeDialog } from "./merge-dialog";

export function AcademyDetailRouteView({
  actionData,
  initialDeleteDialogOpen = false,
  loaderData,
}: {
  actionData?: AcademyDetailActionData;
  initialDeleteDialogOpen?: boolean;
  loaderData: AcademyDetailLoaderData;
}) {
  const { academy, canEdit } = loaderData;
  const errorData =
    actionData?.status === "error" && actionData.intent === updateAcademyIntent
      ? actionData
      : undefined;
  const values = errorData?.values ?? {
    name: academy.name,
    contactName: academy.contactName,
    phone: academy.phone,
  };
  const form = useAcademyDetailForm({ values });
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(
    initialDeleteDialogOpen,
  );
  const mergeDialog = useMergeDialogState(academy.id, actionData);
  const navigation = useNavigation();
  const isSaving = isRouteFormPending(navigation, {
    intent: updateAcademyIntent,
  });

  // A refused merge is told in its dialog, not in a toast.
  useServerActionToast(
    actionData?.status === "merge-refused" ? undefined : actionData,
    { toastId: "administracion-academia:feedback" },
  );

  return (
    <AdminResourceLayout
      requireSelectedEvent={false}
      selectedEventId={loaderData.selectedEventId}
      title={academy.name}
      description="Consultá y actualizá los datos de contacto de la academia."
      headerAction={
        canEdit ? (
          <ResourceActionsMenu contentClassName="w-48" size="icon">
            <DropdownMenuGroup>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => mergeDialog.onOpenChange(true)}
              >
                Fusionar
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setIsDeleteDialogOpen(true)}
              >
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </ResourceActionsMenu>
        ) : undefined
      }
    >
      <AdminResourceFormCard
        footer={
          <>
            <BackButton to="/administracion/academias" />
            {canEdit ? (
              <SubmitButton form={academyDetailFormId} isPending={isSaving} />
            ) : null}
          </>
        }
      >
        <form
          id={academyDetailFormId}
          method="post"
          noValidate
          onSubmit={form.handleSubmit}
        >
          <input type="hidden" name="intent" value={updateAcademyIntent} />
          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <TextInputField
              autoComplete="organization"
              control={form.form.control}
              disabled={!canEdit}
              label="Nombre de la academia"
              name="name"
            />
            <ReadOnlyField
              autoComplete="email"
              label="Email de acceso"
              type="email"
              value={academy.email}
            />
            <TextInputField
              autoComplete="name"
              control={form.form.control}
              disabled={!canEdit}
              label="Nombre de contacto"
              name="contactName"
            />
            <TextInputField
              autoComplete="tel"
              control={form.form.control}
              disabled={!canEdit}
              inputMode="tel"
              label="Teléfono de contacto"
              maxLength={10}
              name="phone"
              placeholder={argentinePhonePlaceholder}
              type="tel"
            />
          </FieldGroup>
        </form>
      </AdminResourceFormCard>
      {canEdit ? (
        // Whether the academy is empty is only known for certain at the moment
        // of the delete, so the dialog always offers the action and the server
        // is what refuses, naming what the academy still holds.
        <DeleteDialog
          title="Eliminar academia"
          description={`Esta acción borra la academia ${academy.name} y su usuario de acceso. Solo procede si no tiene bailarines, profesores, coreografías, inscripciones a seminarios ni pagos.`}
          intentValue={deleteAcademyIntent}
          recordId={academy.id}
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
        />
      ) : null}
      <AcademyMergeDialog
        academy={academy}
        merge={loaderData.merge}
        {...mergeDialog}
      />
    </AdminResourceLayout>
  );
}

function useAcademyDetailForm({ values }: { values: AcademyDetailFormValues }) {
  const form = useForm<
    AcademyDetailFormValues,
    unknown,
    AcademyDetailFormValues
  >({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(academyDetailSchema),
  });

  useEffect(() => {
    form.reset(values);
  }, [form, values.contactName, values.name, values.phone]);

  const submit = useSubmit();

  return {
    form,
    handleSubmit: createValidatedRouteSubmitHandler(form, submit),
  };
}
