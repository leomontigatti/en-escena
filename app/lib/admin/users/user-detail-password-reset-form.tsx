import { CircleAlert } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

import {
  DiscardChangesDialog,
  useDiscardGuard,
} from "@/components/shared/discard-guard";
import { TextInputField } from "@/components/shared/text-input-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  emptyResetPasswordValues,
  resetPasswordIntent,
  resetPasswordSchema,
  type DetailActionData,
  type ResetPasswordFormValues,
} from "@/lib/admin/users/user-detail.shared";
import {
  createValidatedRouteFormDataSubmitHandler,
  isRouteFormPending,
  useOptionalFormAction,
  useOptionalNavigation,
  useOptionalSubmit,
} from "@/lib/shared/forms";

const resetPasswordFormId = "reset-password-form";

/**
 * Setting a temporary password is an action on the user, not an edit of its
 * fields, so it lives in a dialog over the detail. The route closes it when the
 * reset succeeds; a refusal keeps it open with the reason inside, and a typed
 * password is not thrown away without asking.
 */
export function InternalUserResetPasswordDialog({
  error,
  onOpenChange,
  open,
}: {
  /** The refusal of the reset being attempted, not of an earlier opening. */
  error?: DetailActionData;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const form = useForm<
    ResetPasswordFormValues,
    unknown,
    ResetPasswordFormValues
  >({
    defaultValues: emptyResetPasswordValues,
    mode: "onSubmit",
    resolver: zodResolver(resetPasswordSchema),
  });
  const { reset, setError } = form;
  const formAction = useOptionalFormAction();
  const submit = useOptionalSubmit();
  const navigation = useOptionalNavigation();
  const isSaving = isRouteFormPending(navigation, {
    intent: resetPasswordIntent,
  });
  const { discardDialogProps, requestClose } = useDiscardGuard({
    isAudioDirty: false,
    isFormDirty: form.formState.isDirty,
    onClose: () => onOpenChange(false),
  });
  const temporaryPassword = form.watch("temporaryPassword");

  // Every opening starts empty.
  useEffect(() => {
    if (!open) {
      reset(emptyResetPasswordValues);
    }
  }, [open, reset]);

  // A password the client accepted and the server did not belongs on the field.
  useEffect(() => {
    const message = error?.resetPasswordFieldErrors.temporaryPassword;

    if (message) {
      setError("temporaryPassword", { message });
    }
  }, [error, setError]);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            requestClose();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Restablecer contraseña</DialogTitle>
            <DialogDescription>
              Definí una contraseña temporal para este usuario.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>No se pudo restablecer la contraseña</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          ) : null}
          <form
            id={resetPasswordFormId}
            method="post"
            noValidate
            onSubmit={createValidatedRouteFormDataSubmitHandler(
              form,
              submit,
              formAction,
            )}
          >
            <input type="hidden" name="intent" value={resetPasswordIntent} />
            <TextInputField
              autoComplete="new-password"
              control={form.control}
              description="Compartila por un canal seguro. El Usuario deberá cambiarla antes de volver a ingresar a su área privada."
              label="Contraseña temporal"
              name="temporaryPassword"
              type="password"
            />
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={requestClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form={resetPasswordFormId}
              disabled={temporaryPassword.length === 0 || isSaving}
            >
              {isSaving ? <Spinner aria-hidden="true" data-icon /> : null}
              Guardar contraseña temporal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog {...discardDialogProps} />
    </>
  );
}
