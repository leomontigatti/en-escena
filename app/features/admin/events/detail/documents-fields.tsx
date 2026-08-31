import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, useWatch, type UseFormReturn } from "react-hook-form";

import { FileUploadField } from "@/components/shared/file-upload-field";
import { FieldGroup } from "@/components/ui/field";
import {
  eventDocumentDeclarations,
  eventDocumentKinds,
  getEventDocumentSubjectOptions,
  type EventDocumentKind,
} from "@/lib/events/event-documents";
import {
  getAssetKindHelperText,
  getAssetUploadFieldProps,
} from "@/lib/storage/asset-kinds";

import {
  eventDocumentFileField,
  eventDocumentKeptField,
  eventDocumentsPresentField,
  keptEventDocumentValue,
  type EventDetailLoaderData,
} from "./shared";

// The loader's serialized shape, not the read path's `EventDocumentSummary`:
// `uploadedAt` has crossed the wire and arrives as a string.
type SerializedEventDocumentSummary =
  EventDetailLoaderData["documents"][EventDocumentKind];

type EventDocumentsFormValues = Record<string, string>;

export type EventDocumentsController = {
  form: UseFormReturn<EventDocumentsFormValues>;
  /** Whether "Guardar" has anything to do about the documents. */
  hasPendingChanges: boolean;
  /** Documents the save is about to delete, for the confirmation dialog. */
  removedKinds: EventDocumentKind[];
  selectedKinds: EventDocumentKind[];
  /**
   * A chosen file is browser state the upload field owns, so the card can only
   * learn about it by being told.
   */
  setSelectedKind: (kind: EventDocumentKind, isSelected: boolean) => void;
};

/**
 * The documents are fields of the event form, not three forms of their own, so
 * their state has to be readable by the card that owns the "Guardar" button.
 * This hook is that seam: the section renders the inputs, the panel reads what
 * changed.
 */
export function useEventDocumentsForm(
  documents: EventDetailLoaderData["documents"],
): EventDocumentsController {
  const savedKey = getSavedDocumentsKey(documents);
  const values = useMemo(
    () =>
      Object.fromEntries(
        eventDocumentKinds.map((kind) => [
          eventDocumentKeptField(kind),
          documents[kind] ? keptEventDocumentValue : "",
        ]),
      ),
    [documents],
  );
  const form = useForm<EventDocumentsFormValues>({ values });
  const [selectedKinds, setSelectedKinds] = useState<EventDocumentKind[]>([]);
  const keptValues = useWatch({ control: form.control });
  const setSelectedKind = useCallback(
    (kind: EventDocumentKind, isSelected: boolean) => {
      setSelectedKinds((current) => {
        if (current.includes(kind) === isSelected) {
          return current;
        }

        return isSelected
          ? [...current, kind]
          : current.filter((selected) => selected !== kind);
      });
    },
    [],
  );

  // A save replaces what the loader returns, so whatever was staged is now
  // either applied or gone. Keyed by the upload dates rather than by the object
  // so an unrelated revalidation does not discard a file the user just chose.
  useEffect(() => {
    setSelectedKinds([]);
  }, [savedKey]);

  // Emptying the "kept" field is the remove button: the document exists, the
  // administration cleared it and picked nothing in its place.
  const removedKinds = eventDocumentKinds.filter(
    (kind) =>
      documents[kind] !== null &&
      !keptValues[eventDocumentKeptField(kind)] &&
      !selectedKinds.includes(kind),
  );

  return {
    form,
    hasPendingChanges: selectedKinds.length > 0 || removedKinds.length > 0,
    removedKinds,
    selectedKinds,
    setSelectedKind,
  };
}

/**
 * Rendered inside the event form's card, under the event's own fields. Every
 * row is a field, never a form: a document is uploaded, replaced or removed by
 * the card's single "Guardar", the same way a date is.
 */
export function EventDocumentsFields({
  controller,
  documents,
}: {
  controller: EventDocumentsController;
  documents: EventDetailLoaderData["documents"];
}) {
  return (
    <FieldGroup className="gap-5">
      {/* Tells the action this body carries the document fields at all, so a
          submission without them cannot read three empty inputs as "remove
          everything". */}
      <input
        type="hidden"
        name={eventDocumentsPresentField}
        value={keptEventDocumentValue}
      />
      {eventDocumentKinds.map((kind) => (
        <EventDocumentField
          // Remounts once the save lands, which is what clears the native file
          // input: nothing else can, and a stale one would re-upload on the
          // next save.
          key={`${kind}:${documents[kind]?.uploadedAt ?? ""}`}
          controller={controller}
          document={documents[kind]}
          kind={kind}
        />
      ))}
    </FieldGroup>
  );
}

function EventDocumentField({
  controller,
  document,
  kind,
}: {
  controller: EventDocumentsController;
  document: SerializedEventDocumentSummary;
  kind: EventDocumentKind;
}) {
  const declaration = eventDocumentDeclarations[kind];
  const { form, setSelectedKind } = controller;

  return (
    <FileUploadField
      control={form.control}
      name={eventDocumentKeptField(kind)}
      fileInputName={eventDocumentFileField(kind)}
      fieldLabel={declaration.label}
      // An uploaded document reads as a link that opens it, and has to be
      // removed before another can take its place: the field is the whole
      // status, so there is no line under it restating what it already shows.
      downloadLabel="Ver el documento cargado"
      downloadUrl={document?.downloadUrl}
      uploadedLabel="Documento cargado"
      label="Elegí el PDF o arrastralo acá"
      // The compact variant renders no helper text, so the accepted format and
      // the ceiling stand in for the empty value instead.
      placeholder={getAssetKindHelperText("eventDocument")}
      {...getAssetUploadFieldProps(
        "eventDocument",
        getEventDocumentSubjectOptions(kind),
      )}
      previewSelectedFile={false}
      removeLabel={`Quitar ${declaration.subjectLabel}`}
      replaceRequiresRemoval
      variant="compact"
      onSelectedFileChange={(file) => setSelectedKind(kind, file !== null)}
    />
  );
}

function getSavedDocumentsKey(documents: EventDetailLoaderData["documents"]) {
  return eventDocumentKinds
    .map((kind) => documents[kind]?.uploadedAt ?? "")
    .join("|");
}
