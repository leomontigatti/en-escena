import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { FormActions } from "@/components/shared/form-actions";
import { ReadOnlyField } from "@/components/shared/read-only-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { UserFormCard } from "@/lib/admin/users/user-detail-cards";
import { InternalUserEditRoleField } from "@/lib/admin/users/user-detail-role-field";
import {
  buildUpdateInternalUserFormValues,
  updateInternalUserIntent,
  updateInternalUserSchema,
  type DetailActionData,
  type DetailUser,
  type UpdateInternalUserFormValues,
} from "@/lib/admin/users/user-detail.shared";
import {
  createValidatedRouteFormDataSubmitHandler,
  isRouteFormPending,
  useOptionalNavigation,
  useOptionalSubmit,
  useSavedFormValues,
} from "@/lib/shared/forms";

export function InternalUserEditCard({
  actionData,
  backToList,
  user,
}: {
  actionData?: DetailActionData;
  backToList: string;
  user: DetailUser;
}) {
  // Only this form's own refusal refills it. The detail route answers every
  // intent with one shape, so a suspension or a password-reset error also
  // carries `editValues` — empty ones — and adopting those blanked `Nombre`.
  const editError = actionData?.form === "edit" ? actionData : undefined;
  const savedValues = buildUpdateInternalUserFormValues(user);
  const form = useForm<
    UpdateInternalUserFormValues,
    unknown,
    UpdateInternalUserFormValues
  >({
    // The effect below corrects the defaults; this only keeps the first render
    // showing what was typed.
    defaultValues: editError?.editValues ?? savedValues,
    resolver: zodResolver(updateInternalUserSchema),
  });
  const { control, reset } = form;

  useSavedFormValues(form, savedValues, editError?.editValues);

  const submit = useOptionalSubmit();
  const navigation = useOptionalNavigation();
  const isSavingUser = isRouteFormPending(navigation, {
    intent: updateInternalUserIntent,
  });
  const handleSubmit = createValidatedRouteFormDataSubmitHandler(form, submit);

  return (
    <form
      method="post"
      noValidate
      className="flex flex-1 flex-col gap-6"
      onSubmit={handleSubmit}
    >
      <input type="hidden" name="intent" value={updateInternalUserIntent} />
      <UserFormCard
        footer={
          <FormActions
            backTo={backToList}
            hasChanges={form.formState.isDirty}
            isPending={isSavingUser}
            onDiscard={() => reset(savedValues)}
          />
        }
      >
        <TextInputField
          autoComplete="name"
          control={control}
          label="Nombre"
          name="name"
        />
        <ReadOnlyField
          label="Nombre de usuario interno"
          value={user.identifier}
        />
        <InternalUserEditRoleField control={control} mainRole={user.mainRole} />
      </UserFormCard>
    </form>
  );
}
