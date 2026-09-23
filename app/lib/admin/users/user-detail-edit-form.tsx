import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm, useFormState } from "react-hook-form";

import { BackButton, SubmitButton } from "@/components/shared/action-buttons";
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
} from "@/lib/shared/forms";

export function InternalUserEditCard({
  actionData,
  cancelHref,
  user,
}: {
  actionData?: DetailActionData;
  cancelHref: string;
  user: DetailUser;
}) {
  // Only this form's own refusal refills it. The detail route answers every
  // intent with one shape, so a suspension or a password-reset error also
  // carries `editValues` — empty ones — and adopting those blanked `Nombre`.
  const editError = actionData?.form === "edit" ? actionData : undefined;
  const formValues =
    editError?.editValues ?? buildUpdateInternalUserFormValues(user);
  const form = useForm<
    UpdateInternalUserFormValues,
    unknown,
    UpdateInternalUserFormValues
  >({
    defaultValues: formValues,
    resolver: zodResolver(updateInternalUserSchema),
  });
  const { control, reset } = form;

  useEffect(() => {
    reset(formValues);
  }, [reset, formValues.name, formValues.role]);

  const submit = useOptionalSubmit();
  const navigation = useOptionalNavigation();
  const isSavingUser = isRouteFormPending(navigation, {
    intent: updateInternalUserIntent,
  });
  const handleSubmit = createValidatedRouteFormDataSubmitHandler(form, submit);
  // Nothing changed is nothing to save: the button only wakes up once the form
  // is dirty, so a save is always a save of something. A refused save is the
  // exception — it refills the form with what was typed, which clears `isDirty`,
  // and the retry has to stay available.
  const { isDirty } = useFormState({ control });

  return (
    <form method="post" noValidate onSubmit={handleSubmit}>
      <input type="hidden" name="intent" value={updateInternalUserIntent} />
      <UserFormCard
        footer={
          <>
            <BackButton to={cancelHref} />
            <SubmitButton
              disabled={!isDirty && !editError}
              isPending={isSavingUser}
            />
          </>
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
