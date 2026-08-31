import { Check, ExternalLink, LoaderCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useFetcher } from "react-router";

import { AdminResourceFormCard } from "@/components/admin/resource-layout";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { FileUploadField } from "@/components/shared/file-upload-field";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import {
  eventDocumentDeclarations,
  eventDocumentKinds,
  getEventDocumentSubjectOptions,
  type EventDocumentKind,
} from "@/lib/events/event-documents";
import { formatBusinessDate } from "@/lib/shared/business-time-zone";
import { getAssetUploadFieldProps } from "@/lib/storage/asset-kinds";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  deleteEventDocumentIntent,
  uploadEventDocumentIntent,
  type EventDetailActionData,
  type EventDetailLoaderData,
} from "./shared";

// The loader's serialized shape, not the read path's `EventDocumentSummary`:
// `uploadedAt` has crossed the wire and arrives as a string.
type SerializedEventDocumentSummary =
  EventDetailLoaderData["documents"][EventDocumentKind];

export function EventDocumentsCard({
  documents,
}: {
  documents: EventDetailLoaderData["documents"];
}) {
  return (
    <AdminResourceFormCard title="Documentos del evento">
      {eventDocumentKinds.map((kind) => (
        <EventDocumentRow key={kind} document={documents[kind]} kind={kind} />
      ))}
    </AdminResourceFormCard>
  );
}

function EventDocumentRow({
  document,
  kind,
}: {
  document: SerializedEventDocumentSummary;
  kind: EventDocumentKind;
}) {
  const declaration = eventDocumentDeclarations[kind];
  const fetcher = useFetcher<EventDetailActionData>();
  const form = useForm<{ documentStorageKey: string }>({
    values: { documentStorageKey: "" },
  });
  const [hasSelectedFile, setHasSelectedFile] = useState(false);
  const [hasValidationError, setHasValidationError] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const isUploading = fetcher.state !== "idle";

  useServerActionToast(
    fetcher.state === "idle" && fetcher.data ? fetcher.data : undefined,
    { toastId: `admin-evento-documento:${kind}` },
  );

  return (
    <div className="flex flex-col gap-3">
      <fetcher.Form
        method="post"
        encType="multipart/form-data"
        className="flex flex-col gap-3"
      >
        <input type="hidden" name="intent" value={uploadEventDocumentIntent} />
        <input type="hidden" name="kind" value={kind} />
        <FieldGroup>
          <FileUploadField
            control={form.control}
            name="documentStorageKey"
            fileInputName="documentFile"
            fieldLabel={declaration.label}
            label="Arrastrá o hacé click para cargar el PDF"
            {...getAssetUploadFieldProps(
              "eventDocument",
              getEventDocumentSubjectOptions(kind),
            )}
            previewSelectedFile={false}
            removeLabel="Quitar el archivo elegido"
            onSelectedFileChange={(file) => setHasSelectedFile(file !== null)}
            onValidationErrorChange={setHasValidationError}
          />
        </FieldGroup>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Without the date and the link an administration re-uploading three
              PDFs per event cannot tell which ones are already done. */}
          <EventDocumentStatus document={document} />
          <div className="flex items-center gap-2">
            {document ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDeleteDialogOpen(true)}
              >
                <Trash2 aria-hidden="true" data-icon="inline-start" />
                Eliminar
              </Button>
            ) : null}
            <Button
              type="submit"
              disabled={!hasSelectedFile || hasValidationError || isUploading}
            >
              {isUploading ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <Check aria-hidden="true" data-icon="inline-start" />
              )}
              {document ? "Reemplazar" : "Cargar"}
            </Button>
          </div>
        </div>
      </fetcher.Form>
      <DeleteDialog
        title={`Eliminar ${declaration.label.toLocaleLowerCase("es-AR")}`}
        description={`Esta acción no se puede deshacer. Las academias van a dejar de ver ${declaration.label.toLocaleLowerCase("es-AR")}.`}
        intentValue={deleteEventDocumentIntent}
        confirmFieldName="kind"
        recordId={kind}
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      />
    </div>
  );
}

function EventDocumentStatus({
  document,
}: {
  document: SerializedEventDocumentSummary;
}) {
  if (!document) {
    return (
      <p className="text-sm text-muted-foreground">Todavía no está cargado.</p>
    );
  }

  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <span>Cargado el {formatBusinessDate(document.uploadedAt)}</span>
      {document.downloadUrl ? (
        <a href={document.downloadUrl} target="_blank" rel="noreferrer">
          <ExternalLink aria-hidden="true" className="inline size-3.5" /> Ver el
          documento actual
        </a>
      ) : null}
    </p>
  );
}
