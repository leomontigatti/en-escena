import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

import {
  DiscardChangesDialog,
  useDiscardGuard,
} from "@/components/shared/discard-guard";
import { TextInputField } from "@/components/shared/text-input-field";
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
 * Setting a new password is an action on the user, not an edit of its
 * fields, so it lives in a dialog over the detail. The route closes it when the
 * reset succeeds; a refusal is the route's toast and keeps it open over what
 * was typed, and a typed password is not thrown away without asking.
 */
export function InternalUserResetPasswordDialog({
  onOpenChange,
  open,
}: {
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
  const { reset } = form;
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
  const password = form.watch("password");

  // Every opening starts empty.
  useEffect(() => {
    if (!open) {
      reset(emptyResetPasswordValues);
    }
  }, [open, reset]);

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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restablecer contraseña</DialogTitle>
            <DialogDescription>
              Definí una nueva contraseña para este usuario.
            </DialogDescription>
          </DialogHeader>
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
              description="Compartila por un canal seguro. Sus sesiones abiertas se cierran y vuelve a ingresar con esta contraseña."
              label="Nueva contraseña"
              name="password"
              type="password"
            />
          </form>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={requestClose}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form={resetPasswordFormId}
              disabled={password.length === 0 || isSaving}
            >
              {isSaving ? (
                <Spinner aria-hidden="true" data-icon="inline-start" />
              ) : null}
              Guardar contraseña
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog {...discardDialogProps} />
    </>
  );
}
