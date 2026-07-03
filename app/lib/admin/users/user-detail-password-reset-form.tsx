import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, type FormEvent } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { Link } from "react-router";

import { TextInputField } from "@/components/shared/text-input-field";
import { Button } from "@/components/ui/button";
import { UserFormCard } from "@/lib/admin/users/user-detail-cards";
import {
  emptyResetPasswordValues,
  resetPasswordIntent,
  resetPasswordSchema,
  type DetailActionData,
  type ResetPasswordFormValues,
} from "@/lib/admin/users/user-detail.shared";

export function InternalUserResetPasswordCard({
  actionData,
  cancelHref,
}: {
  actionData?: DetailActionData;
  cancelHref: string;
}) {
  const formValues =
    actionData?.resetPasswordValues ?? emptyResetPasswordValues;
  const form = useForm<
    ResetPasswordFormValues,
    unknown,
    ResetPasswordFormValues
  >({
    defaultValues: formValues,
    mode: "onSubmit",
    resolver: zodResolver(resetPasswordSchema),
  });

  useEffect(() => {
    form.reset(formValues);
  }, [form, formValues.temporaryPassword]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formElement = event.currentTarget;
    const submitNativeForm: SubmitHandler<ResetPasswordFormValues> = () => {
      formElement.submit();
    };

    void form.handleSubmit(submitNativeForm)(event);
  }

  return (
    <form method="post" noValidate onSubmit={handleSubmit}>
      <UserFormCard
        title="Restablecimiento administrativo de contraseña"
        footer={
          <>
            <Button asChild variant="outline">
              <Link to={cancelHref}>Cancelar</Link>
            </Button>
            <Button type="submit">Guardar contraseña temporal</Button>
          </>
        }
      >
        <input type="hidden" name="intent" value={resetPasswordIntent} />
        <TextInputField
          autoComplete="new-password"
          className="md:col-span-2"
          control={form.control}
          description="Compartila por un canal seguro. El Usuario deberá cambiarla antes de volver a ingresar a su área privada."
          label="Contraseña temporal"
          name="temporaryPassword"
          orientation="responsive"
          type="password"
        />
      </UserFormCard>
    </form>
  );
}
