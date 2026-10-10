import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useFetcher } from "react-router";

import { CopyIconButton } from "@/components/shared/copy-icon-button";
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
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { createValidatedReactRouterSubmitHandler } from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { GrandFinalListActionData } from "../list/shared";
import {
  createAuditLinkIntent,
  createAuditLinkSchema,
  type AuditLinkHandoverData,
  type CreateAuditLinkFormValues,
} from "./shared";

/**
 * Creates an `auditLink` for the auditor administration names, then hands it
 * over in the same dialog: its QR to scan from this screen and its address to
 * copy. The auditor's name on the list shows it again later. A refusal is a
 * toast and the form stays (docs/agents/form-feedback.md).
 */
export function CreateAuditLinkDialog({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}) {
  const fetcher = useFetcher<GrandFinalListActionData>();
  const isSaving = fetcher.state !== "idle";
  const form = useForm<CreateAuditLinkFormValues>({
    defaultValues: { intent: createAuditLinkIntent, label: "" },
    resolver: zodResolver(createAuditLinkSchema),
  });
  const label = form.watch("label");
  const created = fetcher.data?.auditLink;

  useServerActionToast(fetcher.data);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const { discardDialogProps, requestClose } = useDiscardGuard({
    isAudioDirty: false,
    isFormDirty: !created && label.trim() !== "",
    onClose: close,
  });

  return (
    <>
      <Dialog
        open
        onOpenChange={(next) => {
          if (!next && !isSaving) {
            requestClose();
          }
        }}
      >
        <DialogContent>
          {created ? (
            <AuditLinkHandover link={created} onDone={close} />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Crear acceso de auditoría</DialogTitle>
                <DialogDescription>
                  El acceso muestra los totales de la votación abierta y se abre
                  en un solo dispositivo: el primero que lo abra.
                </DialogDescription>
              </DialogHeader>
              <form
                method="post"
                onSubmit={createValidatedReactRouterSubmitHandler(
                  form,
                  fetcher.submit,
                  { method: "post" },
                )}
                className="flex flex-col gap-4"
              >
                <FieldGroup>
                  <TextInputField
                    control={form.control}
                    disabled={isSaving}
                    label="Auditor"
                    name="label"
                    placeholder="Nombre de quien recibe el acceso"
                  />
                </FieldGroup>
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
                    disabled={isSaving || label.trim() === ""}
                  >
                    {isSaving ? (
                      <Spinner aria-hidden="true" data-icon="inline-start" />
                    ) : null}
                    Crear
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog {...discardDialogProps} />
    </>
  );
}

/**
 * A live link as its dialog hands it over: its QR to scan from this screen and
 * its address to copy. `action` sits before `Listo`, for a dialog that offers
 * something more than reading the link.
 */
export function AuditLinkHandover({
  action,
  link,
  onDone,
}: {
  action?: ReactNode;
  link: AuditLinkHandoverData;
  onDone: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Acceso de auditoría de {link.label}</DialogTitle>
        <DialogDescription>
          Que lo escanee o lo abra en el celular con el que va a seguir la
          votación. Se puede abrir en más de un dispositivo y deja de funcionar
          cuando cierra la votación o lo revocás.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col items-center gap-4">
        <img
          alt={`Código QR del acceso de auditoría de ${link.label}`}
          className="size-48"
          src={link.qrDataUri}
        />
        <div className="flex w-full items-center gap-2">
          <Input
            aria-label="Enlace del acceso de auditoría"
            readOnly
            value={link.url}
          />
          <CopyIconButton label="enlace" value={link.url} />
        </div>
      </div>
      <DialogFooter>
        {action}
        <Button type="button" onClick={onDone}>
          Listo
        </Button>
      </DialogFooter>
    </>
  );
}
