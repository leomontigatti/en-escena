import { zodResolver } from "@hookform/resolvers/zod";
import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { useNavigation, useSubmit } from "react-router";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { FileUploadField } from "@/components/shared/file-upload-field";
import { FormActions } from "@/components/shared/form-actions";
import { MultiComboboxField } from "@/components/shared/multi-combobox-field";
import { FieldGroup } from "@/components/ui/field";
import {
  grandFinalBannerRuleLabel,
  grandFinalBannerSlotLabels,
  grandFinalBannerSlots,
  type GrandFinalBannerSlot,
} from "@/lib/grand-final/banner-shape";
import {
  createValidatedReactRouterSubmitHandler,
  useSavedFormValues,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";
import {
  getAssetKindHelperText,
  getAssetUploadFieldProps,
} from "@/lib/storage/asset-kinds";

import {
  bannerFieldNames,
  academyGrandFinalFormSchema,
  judgeIdsFieldName,
  judgeIdsPostedFieldName,
  saveAcademyGrandFinalIntent,
  type AcademyGrandFinalActionData,
  type AcademyGrandFinalFormValues,
  type AcademyGrandFinalLoaderData,
} from "./shared";

const formId = "academy-grand-final-form";

const noPickedBanners: Record<GrandFinalBannerSlot, boolean> = {
  first: false,
  second: false,
};

/**
 * An academy's `Gran final` page in one modality, which the description
 * names: the judges who picked it there, and, once one did in any modality
 * and it is a `finalist`, its two banners.
 * Each banner shows the stored picture, and is replaced by picking another or
 * emptied with its delete button. Everything waits for one `Guardar`, which
 * asks first when a judge added here stops picking another academy, and names
 * each one.
 */
export function AcademyGrandFinalView({
  actionData,
  loaderData,
}: {
  actionData?: AcademyGrandFinalActionData;
  loaderData: AcademyGrandFinalLoaderData;
}) {
  useServerActionToast(actionData);

  const navigation = useNavigation();
  const submit = useSubmit();
  const form = useForm<AcademyGrandFinalFormValues>({
    defaultValues: loaderData.values,
    resolver: zodResolver(academyGrandFinalFormSchema),
  });
  useSavedFormValues(form, loaderData.values);

  // A picked file lives in its input, not in the form's values, so `isDirty`
  // cannot see it. A save that stores new banners and `Descartar cambios`
  // remount the fields, so their inputs let go of what they held.
  const [pickedBanners, setPickedBanners] = useState(noPickedBanners);
  const [discardCount, setDiscardCount] = useState(0);
  const savedKey = `${loaderData.values.firstBannerStorageKey}:${loaderData.values.secondBannerStorageKey}`;

  useEffect(() => {
    setPickedBanners(noPickedBanners);
  }, [savedKey]);

  const formRef = useRef<HTMLFormElement>(null);
  const isConfirmedRef = useRef(false);
  const [movedPicks, setMovedPicks] = useState<string[]>([]);
  const submitValidated = createValidatedReactRouterSubmitHandler(
    form,
    submit,
    { encType: "multipart/form-data", method: "post" },
  );

  const isPending =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === saveAcademyGrandFinalIntent;

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title={loaderData.academyName}
      description={
        loaderData.finalist
          ? `${loaderData.modalityName}. Elegí qué jueces la eligieron como finalista y subí las dos fotos que muestra la votación.`
          : `${loaderData.modalityName}. Elegí qué jueces la eligieron como finalista. Cuando la elija uno, vas a poder subir sus banners.`
      }
    >
      <AdminResourceFormCard
        footer={
          <FormActions
            backTo="/administracion/gran-final"
            form={formId}
            hasChanges={
              form.formState.isDirty ||
              pickedBanners.first ||
              pickedBanners.second
            }
            isPending={isPending}
            onDiscard={() => {
              form.reset(loaderData.values);
              setPickedBanners(noPickedBanners);
              setDiscardCount((count) => count + 1);
            }}
          />
        }
      >
        <form
          id={formId}
          ref={formRef}
          method="post"
          encType="multipart/form-data"
          noValidate
          onSubmit={(event) => {
            const moved = isConfirmedRef.current
              ? []
              : listMovedPicks(loaderData, form.getValues("judgeIds"));
            isConfirmedRef.current = false;

            if (moved.length > 0) {
              event.preventDefault();
              setMovedPicks(moved);

              return;
            }

            void submitValidated(event);
          }}
        >
          <input
            type="hidden"
            name="intent"
            value={saveAcademyGrandFinalIntent}
          />
          <FieldGroup
            key={`${savedKey}:${discardCount}`}
            className="grid gap-5 md:grid-cols-2"
          >
            <input type="hidden" name={judgeIdsPostedFieldName} value="1" />
            <JudgesField form={form} loaderData={loaderData} />
            {loaderData.finalist
              ? grandFinalBannerSlots.map((slot) => (
                  <FileUploadField
                    key={slot}
                    control={form.control}
                    name={bannerFieldNames[slot].storageKey}
                    fileInputName={bannerFieldNames[slot].file}
                    fieldLabel={grandFinalBannerSlotLabels[slot]}
                    existingPreviewUrl={loaderData.bannerUrls[slot]}
                    onSelectedFileChange={(file) =>
                      setPickedBanners((picked) => ({
                        ...picked,
                        [slot]: file !== null,
                      }))
                    }
                    label="Arrastrá o hacé click"
                    {...getAssetUploadFieldProps("grandFinalBanner", {
                      fieldLabel: grandFinalBannerSlotLabels[slot],
                    })}
                    helperText={`${grandFinalBannerRuleLabel}. ${getAssetKindHelperText("grandFinalBanner")}`}
                  />
                ))
              : null}
          </FieldGroup>
        </form>
      </AdminResourceFormCard>
      <ConfirmationDialog
        className="sm:max-w-lg"
        confirmIcon={Check}
        confirmLabel="Guardar"
        description="Cada juez elige una sola academia por modalidad, así que guardar también cambia lo siguiente."
        onConfirm={() => {
          isConfirmedRef.current = true;
          formRef.current?.requestSubmit();
        }}
        onOpenChange={(open) => {
          if (!open) {
            setMovedPicks([]);
          }
        }}
        open={movedPicks.length > 0}
        title="¿Guardar los cambios?"
      >
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          {movedPicks.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </ConfirmationDialog>
    </AdminResourceLayout>
  );
}

/**
 * The judges who picked the academy in the page's modality. Where it stopped
 * qualifying, a judge can only be taken away: the options are the judges who
 * picked it.
 */
function JudgesField({
  form,
  loaderData,
}: {
  form: UseFormReturn<AcademyGrandFinalFormValues>;
  loaderData: AcademyGrandFinalLoaderData;
}) {
  return (
    <MultiComboboxField
      className="md:col-span-2"
      control={form.control}
      description={
        loaderData.eligible
          ? undefined
          : "Ya no cumple los requisitos en esta modalidad: solo se pueden quitar jueces."
      }
      emptyMessage="No hay más jueces en el evento."
      inputName={judgeIdsFieldName}
      label="Jueces que la eligieron"
      name="judgeIds"
      options={loaderData.judges
        .filter(
          (judge) =>
            loaderData.eligible ||
            loaderData.values.judgeIds.includes(judge.id),
        )
        .map((judge) => ({ label: judge.name, value: judge.id }))}
      placeholder="Ningún juez"
    />
  );
}

/**
 * Each judge added here who picked another academy in the modality, as the
 * line the confirmation names: that academy loses the judge's pick.
 */
function listMovedPicks(
  loaderData: AcademyGrandFinalLoaderData,
  judgeIds: string[],
) {
  const judgeNames = new Map(
    loaderData.judges.map((judge) => [judge.id, judge.name]),
  );

  return judgeIds
    .filter((judgeId) => !loaderData.values.judgeIds.includes(judgeId))
    .flatMap((judgeId) => {
      const academyName = loaderData.otherPicks[judgeId];

      return academyName
        ? [
            `${judgeNames.get(judgeId) ?? "Un juez"} deja de elegir a ${academyName}`,
          ]
        : [];
    });
}
