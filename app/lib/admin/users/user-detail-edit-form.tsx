import { zodResolver } from "@hookform/resolvers/zod";
import { Check } from "lucide-react";
import { useEffect, type FormEvent } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { Link } from "react-router";

import { ReadOnlyField } from "@/components/shared/read-only-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { Button } from "@/components/ui/button";
import { UserFormCard } from "@/lib/admin/users/user-detail-cards";
import { InternalUserEditRoleField } from "@/lib/admin/users/user-detail-role-field";
import {
  buildUpdateInternalUserFormValues,
  updateInternalUserSchema,
  type DetailActionData,
  type DetailUser,
  type UpdateInternalUserFormValues,
} from "@/lib/admin/users/user-detail.shared";

export function InternalUserEditCard({
  actionData,
  cancelHref,
  user,
}: {
  actionData?: DetailActionData;
  cancelHref: string;
  user: DetailUser;
}) {
  const formValues =
    actionData?.editValues ?? buildUpdateInternalUserFormValues(user);
  const form = useForm<
    UpdateInternalUserFormValues,
    unknown,
    UpdateInternalUserFormValues
  >({
    defaultValues: formValues,
    mode: "onSubmit",
    resolver: zodResolver(updateInternalUserSchema),
  });

  useEffect(() => {
    form.reset(formValues);
  }, [form, formValues.email, formValues.name, formValues.role]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formElement = event.currentTarget;
    const submitNativeForm: SubmitHandler<
      UpdateInternalUserFormValues
    > = () => {
      formElement.submit();
    };

    void form.handleSubmit(submitNativeForm)(event);
  }

  return (
    <form method="post" noValidate onSubmit={handleSubmit}>
      <UserFormCard
        footer={
          <>
            <Button asChild variant="outline">
              <Link to={cancelHref}>Volver</Link>
            </Button>
            <Button type="submit">
              <Check aria-hidden="true" data-icon="inline-start" />
              Guardar
            </Button>
          </>
        }
      >
        <TextInputField
          autoComplete="name"
          control={form.control}
          label="Nombre"
          name="name"
        />
        <ReadOnlyField
          label="Nombre de usuario interno"
          value={user.identifier}
        />
        <TextInputField
          autoComplete="email"
          control={form.control}
          label="Correo"
          name="email"
          type="email"
        />
        <InternalUserEditRoleField control={form.control} />
      </UserFormCard>
    </form>
  );
}
