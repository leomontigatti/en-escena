// PROTOTYPE — throwaway, lives only on branch `prototype/890-seminar-money-admin`.
//
// Part of the admin seminar-money prototype for wayfinder ticket #890 (map #884):
// the seminar detail, with the seminar kind and the deposit rate in `Información`.
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { BackButton, SubmitButton } from "@/components/shared/action-buttons";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { FileUploadField } from "@/components/shared/file-upload-field";
import { IntegerInputField } from "@/components/shared/integer-input-field";
import { SelectField } from "@/components/shared/select-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { TimeOnlyField } from "@/components/shared/time-only-field";
import { FieldGroup } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SeminarActions } from "@/features/admin/seminars/actions";
import { SeminarInscriptionsTable } from "@/features/admin/seminars/inscriptions-table";
import {
  keptSeminarPictureValue,
  seminarPictureFileField,
  seminarPictureKeptField,
} from "@/features/admin/seminars/shared";
import { formatAvailablePlacesSuffix } from "@/features/admin/schedules/view-shared";
import {
  getAssetKindHelperText,
  getAssetUploadFieldProps,
} from "@/lib/storage/asset-kinds";
import type { SeminarListItem } from "@/lib/seminars/repository.server";
import {
  seminarKindOptions,
  type PrototypeSeminar,
  type SeminarInscriptionFigures,
} from "./seminar-money-fixtures.prototype";

type Record = (entry: string) => void;

type SeminarPrototypeFormValues = {
  instructorName: string;
  kind: string;
  scheduledDate: string;
  startTime: string;
  quota: string;
  requiredDepositPercentage: string;
  [seminarPictureKeptField]: string;
};

/**
 * The seminar detail as it stays: `Información` and `Inscriptos`, no prices tab
 * — seminar prices are event-level rows edited under `Bases del evento` ›
 * `Precios` (#904). `Información` gains `Tipo de seminario` (default `Común`)
 * beside the instructor and `Seña (%)` beside the quota; the instructor picture
 * takes the full width, as on the real form (review on #890).
 */
export function SeminarDetailPrototype({
  backHref,
  inscriptions,
  record,
  seminar,
}: {
  backHref: string;
  inscriptions: SeminarInscriptionFigures[];
  record: Record;
  seminar: PrototypeSeminar;
}) {
  const seminarListItem = {
    id: seminar.id,
    instructorName: seminar.instructorName,
    inscriptionCount: seminar.registeredCount,
  } as SeminarListItem;

  return (
    <AdminResourceLayout
      selectedEventId="evento-prototipo"
      title="Editar seminario"
      description="Editá el instructor, su foto, la fecha, la hora, el cupo, el tipo y la seña del seminario."
      headerAction={<SeminarActions seminar={seminarListItem} />}
    >
      <Tabs defaultValue="informacion">
        <TabsList variant="line">
          <TabsTrigger value="informacion">Información</TabsTrigger>
          <TabsTrigger value="inscriptos">Inscriptos</TabsTrigger>
        </TabsList>
        <TabsContent value="informacion" className="pt-2">
          <SeminarInformationForm
            backHref={backHref}
            record={record}
            seminar={seminar}
          />
        </TabsContent>
        <TabsContent value="inscriptos" className="pt-2">
          {/* The real roster, unchanged: active rows only and no money (#889). */}
          <SeminarInscriptionsTable
            inscriptions={inscriptions
              .filter((inscription) => !inscription.withdrawn)
              .map((inscription) => ({
                id: inscription.id,
                fullName: inscription.fullName,
                personKind: inscription.personKind,
                academyName: inscription.academyName,
              }))}
          />
        </TabsContent>
      </Tabs>
    </AdminResourceLayout>
  );
}

function SeminarInformationForm({
  backHref,
  record,
  seminar,
}: {
  backHref: string;
  record: Record;
  seminar: PrototypeSeminar;
}) {
  const formId = "prototype-seminar-information-form";
  // The rate and the kind are both locked while any inscription is covered
  // (#904): the shared fields' read-only look and lock icon say so, with no
  // description under them.
  const isMoneyLocked = seminar.coveredCount > 0;
  const form = useForm<SeminarPrototypeFormValues>({
    defaultValues: {
      instructorName: seminar.instructorName,
      kind: seminar.kind,
      scheduledDate: seminar.scheduledDate,
      startTime: seminar.startTime,
      quota: String(seminar.quota),
      requiredDepositPercentage: String(seminar.requiredDepositPercentage),
      // The seminar already has a picture, so the field opens on "Abrir foto".
      [seminarPictureKeptField]: keptSeminarPictureValue,
    },
  });
  const onSubmit = form.handleSubmit((values) => {
    // The quota floor is a server refusal, so it is a toast (style guide).
    if (Number(values.quota) < seminar.coveredCount) {
      toast.error(
        `El cupo no puede ser menor a las ${seminar.coveredCount} inscripciones con la seña cubierta.`,
      );
      return;
    }

    toast.success("Prototipo: se habría guardado el seminario.");
    record(`Guardar seminario → ${JSON.stringify(values)}`);
    // Saved values become the new baseline, so `Guardar` disables again.
    form.reset(values);
  });

  return (
    <AdminResourceFormCard>
      <form
        id={formId}
        noValidate
        className="flex w-full flex-col gap-5"
        encType="multipart/form-data"
        onSubmit={(event) => void onSubmit(event)}
      >
        <FieldGroup className="grid gap-4 sm:grid-cols-2 sm:items-start">
          <TextInputField
            control={form.control}
            label="Instructor"
            name="instructorName"
          />
          <SelectField
            control={form.control}
            label="Tipo de seminario"
            name="kind"
            options={seminarKindOptions}
            disabled={isMoneyLocked}
          />
          <DateOnlyField
            control={form.control}
            name="scheduledDate"
            id="prototype-seminar-date"
            label="Fecha"
            buttonClassName="w-full"
          />
          <TimeOnlyField control={form.control} label="Hora" name="startTime" />
          <IntegerInputField
            control={form.control}
            label="Cupo"
            min={1}
            name="quota"
            step={1}
            suffix={formatAvailablePlacesSuffix(
              seminar.quota - seminar.coveredCount,
            )}
          />
          <IntegerInputField
            control={form.control}
            label="Seña (%)"
            name="requiredDepositPercentage"
            min={1}
            max={99}
            step={1}
            disabled={isMoneyLocked}
          />
          {/* `FileUploadField` forwards `className` to the control, so the grid
              span lives on a wrapper, as on the real seminar form. */}
          <div className="sm:col-span-2">
            <FileUploadField
              control={form.control}
              name={seminarPictureKeptField}
              fileInputName={seminarPictureFileField}
              fieldLabel="Foto del instructor"
              downloadLabel="Abrir foto"
              downloadUrl="#"
              uploadedLabel="Foto cargada"
              label="Elegí la foto o arrastrala acá"
              placeholder={getAssetKindHelperText("seminarInstructorPicture")}
              {...getAssetUploadFieldProps("seminarInstructorPicture")}
              previewSelectedFile={false}
              removeLabel="Quitar la foto del instructor"
              replaceRequiresRemoval
              variant="compact"
            />
          </div>
        </FieldGroup>
      </form>
      <div className="flex items-center justify-between gap-2">
        <BackButton to={backHref} />
        {/* Nothing to save until a field changes. */}
        <SubmitButton
          form={formId}
          isPending={false}
          disabled={!form.formState.isDirty}
        />
      </div>
    </AdminResourceFormCard>
  );
}
