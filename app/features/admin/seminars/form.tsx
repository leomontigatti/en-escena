import { useEffect, useMemo, type ReactNode } from "react";
import { useForm, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { AdminResourceFormCard } from "@/components/admin/resource-layout";
import { BackButton, SubmitButton } from "@/components/shared/action-buttons";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { FileUploadField } from "@/components/shared/file-upload-field";
import { IntegerInputField } from "@/components/shared/integer-input-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { TimeOnlyField } from "@/components/shared/time-only-field";
import { FieldGroup } from "@/components/ui/field";
import {
  getAssetKindHelperText,
  getAssetUploadFieldProps,
} from "@/lib/storage/asset-kinds";
import {
  describeAvailablePlaces,
  formatAvailablePlacesSuffix,
} from "@/features/admin/schedules/view-shared";
import {
  createValidatedRouteSubmitHandler,
  isRouteFormPending,
  type RouteFormPendingScope,
  useOptionalFormAction,
  useOptionalNavigation,
  useOptionalSubmit,
} from "@/lib/shared/forms";
import { buildListPath } from "@/lib/shared/navigation";

import {
  basePath,
  keptSeminarPictureValue,
  seminarFormSchema,
  seminarPictureFileField,
  seminarPictureKeptField,
  seminarPicturePresentField,
  type SeminarActionData,
  type SeminarFormValues,
} from "./shared";

/**
 * The quota of a seminar that already exists, so the field can show what is
 * left of it. A seminar being created has neither, which is why the pair
 * travels together instead of as two optional numbers.
 */
type SeminarQuotaOccupancy = {
  availablePlaces: number;
  quota: number;
};

export function SeminarForm({
  actionData,
  formId,
  instructorPictureUrl,
  intent,
  occupancy,
  showInstructorPicture = false,
  values,
}: {
  actionData?: SeminarActionData;
  formId: string;
  /** A signed link to the stored picture, or `null` when there is none. */
  instructorPictureUrl?: string | null;
  intent: string;
  occupancy?: SeminarQuotaOccupancy;
  /** The picture belongs to a seminar that exists, so the create page has none. */
  showInstructorPicture?: boolean;
  values: SeminarFormValues;
}) {
  const defaultValues = useMemo(
    () =>
      actionData?.intent === intent ? (actionData.values ?? values) : values,
    [actionData, intent, values],
  );
  const form = useForm<SeminarFormValues>({
    resolver: zodResolver(seminarFormSchema),
    defaultValues,
  });
  const formAction = useOptionalFormAction();
  const submit = useOptionalSubmit();
  const { reset, setError } = form;

  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  // A refusal the server alone can see — the same instructor at the same
  // moment — belongs on the field that caused it, not only in the toast.
  useEffect(() => {
    if (actionData?.intent !== intent || !actionData.fieldErrors) {
      return;
    }

    for (const [fieldName, message] of Object.entries(actionData.fieldErrors)) {
      if (message) {
        setError(fieldName as keyof SeminarFormValues, {
          message,
          type: "manual",
        });
      }
    }
  }, [actionData, intent, setError]);

  return (
    <form
      id={formId}
      method="post"
      className="flex w-full flex-col gap-5"
      // The picture travels with the rest of the form, so the body is multipart
      // wherever the field is rendered.
      encType={showInstructorPicture ? "multipart/form-data" : undefined}
      onSubmit={createValidatedRouteSubmitHandler(form, submit, formAction)}
    >
      <input type="hidden" name="intent" value={intent} />
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <TextInputField
          control={form.control}
          id="instructorName"
          label="Instructor"
          name="instructorName"
        />
        <IntegerInputField
          control={form.control}
          id="quota"
          // The visible label stays just the label; the accessible name carries
          // the count that the decorative suffix cannot.
          aria-label={
            occupancy
              ? `Cupo. ${describeAvailablePlaces({
                  availablePlaces: occupancy.availablePlaces,
                  capacity: occupancy.quota,
                })}`
              : undefined
          }
          label="Cupo"
          min={1}
          name="quota"
          step={1}
          suffix={
            occupancy
              ? formatAvailablePlacesSuffix(occupancy.availablePlaces)
              : undefined
          }
        />
        <DateOnlyField
          control={form.control}
          name="scheduledDate"
          id={`seminar-date-${intent}`}
          label="Fecha"
          buttonClassName="w-full"
        />
        <TimeOnlyField control={form.control} label="Hora" name="startTime" />
        {showInstructorPicture ? (
          <InstructorPictureField
            control={form.control}
            downloadUrl={instructorPictureUrl ?? undefined}
          />
        ) : null}
      </FieldGroup>
    </form>
  );
}

/**
 * The event-document upload field, configured the same way: an uploaded picture
 * reads as a link that opens it and has to be removed before another can take
 * its place. `FileUploadField` forwards `className` to the control rather than
 * to the wrapper, so the grid span lives on a wrapper element around it.
 */
function InstructorPictureField({
  control,
  downloadUrl,
}: {
  control: Control<SeminarFormValues>;
  downloadUrl?: string;
}) {
  return (
    <div className="sm:col-span-2">
      {/* Tells the action this body carries the picture at all, so a submission
          without the field cannot read an empty input as "remove the picture". */}
      <input
        type="hidden"
        name={seminarPicturePresentField}
        value={keptSeminarPictureValue}
      />
      <FileUploadField
        control={control}
        name={seminarPictureKeptField}
        fileInputName={seminarPictureFileField}
        fieldLabel="Foto del instructor"
        downloadLabel="Abrir foto"
        downloadUrl={downloadUrl}
        uploadedLabel="Foto cargada"
        label="Elegí la foto o arrastrala acá"
        // The compact variant renders no helper text, so the accepted formats
        // and the ceiling stand in for the empty value instead.
        placeholder={getAssetKindHelperText("seminarInstructorPicture")}
        {...getAssetUploadFieldProps("seminarInstructorPicture")}
        previewSelectedFile={false}
        removeLabel="Quitar la foto del instructor"
        replaceRequiresRemoval
        variant="compact"
      />
    </div>
  );
}

export function SeminarFormActions({
  formId,
  pendingScope,
  selectedEventId,
}: {
  formId: string;
  pendingScope: RouteFormPendingScope;
  selectedEventId: string | null;
}) {
  const navigation = useOptionalNavigation();
  const isPending = isRouteFormPending(navigation, pendingScope);

  return (
    <div className="flex items-center justify-between gap-2">
      <BackButton to={buildListPath(basePath, selectedEventId)} />
      <SubmitButton form={formId} isPending={isPending} />
    </div>
  );
}

export function SeminarFormPanel({ children }: { children: ReactNode }) {
  return <AdminResourceFormCard>{children}</AdminResourceFormCard>;
}
