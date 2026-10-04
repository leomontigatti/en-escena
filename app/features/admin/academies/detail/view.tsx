import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useFormState } from "react-hook-form";
import { useNavigation, useSubmit } from "react-router";

import { useMergeDialogState } from "@/features/admin/merge/dialog";
import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { ReasonList } from "@/components/shared/reason-list";
import { FormActions } from "@/components/shared/form-actions";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { ReadOnlyField } from "@/components/shared/read-only-field";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { SelectField } from "@/components/shared/select-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { FieldGroup } from "@/components/ui/field";
import { provinceOptions } from "@/lib/academies/provinces";
import { argentinePhonePlaceholder } from "@/lib/shared/argentine-phone";
import {
  createValidatedRouteSubmitHandler,
  isRouteFormPending,
  useSavedFormValues,
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
  const form = useAcademyDetailForm({
    saved: {
      name: academy.name,
      contactName: academy.contactName,
      phone: academy.phone,
      city: academy.city,
      province: academy.province,
    },
    submitted: errorData?.values,
  });
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
      description="Consultá y actualizá los datos de contacto y la ubicación de la academia."
      headerAction={
        canEdit ? (
          <ResourceActionsMenu contentClassName="w-48">
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
          <FormActions
            backTo="/administracion/academias"
            canEdit={canEdit}
            form={academyDetailFormId}
            hasChanges={form.hasChanges}
            isPending={isSaving}
            onDiscard={form.discard}
          />
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
            <SelectField
              control={form.form.control}
              disabled={!canEdit}
              label="Provincia"
              name="province"
              options={provinceOptions}
              placeholder="Elegí una provincia"
            />
            <TextInputField
              autoComplete="address-level2"
              control={form.form.control}
              disabled={!canEdit}
              label="Ciudad"
              name="city"
            />
          </FieldGroup>
        </form>
      </AdminResourceFormCard>
      {canEdit ? (
        // An academy that still holds something answers `Eliminar` with what
        // it holds (style guide, Detail pages); the delete reads it again
        // inside its transaction, for the race.
        <DeleteDialog
          title="¿Eliminar la academia?"
          blockedTitle="No se puede eliminar la academia"
          description={
            loaderData.deletionHoldings.length > 0
              ? "Solo se puede eliminar una academia vacía. Si es un duplicado, fusionala con la otra."
              : `Esta acción borra la academia ${academy.name} y su usuario de acceso.`
          }
          isBlocked={loaderData.deletionHoldings.length > 0}
          blockedDescription={
            <ReasonList
              reasons={loaderData.deletionHoldings.map(
                (holding) => `Tiene ${holding}.`,
              )}
            />
          }
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

/**
 * The form holds what is saved as its defaults, so a save the server refused,
 * which refills what was typed, still reads as a change.
 */
function useAcademyDetailForm({
  saved,
  submitted,
}: {
  saved: AcademyDetailFormValues;
  submitted?: AcademyDetailFormValues;
}) {
  const form = useForm<
    AcademyDetailFormValues,
    unknown,
    AcademyDetailFormValues
  >({
    defaultValues: saved,
    mode: "onSubmit",
    resolver: zodResolver(academyDetailSchema),
  });
  const { isDirty } = useFormState({ control: form.control });

  useSavedFormValues(form, saved, submitted);

  const submit = useSubmit();

  return {
    discard: () => form.reset(),
    form,
    handleSubmit: createValidatedRouteSubmitHandler(form, submit),
    hasChanges: isDirty,
  };
}
