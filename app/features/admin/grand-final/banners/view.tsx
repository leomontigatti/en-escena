import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigation, useSubmit } from "react-router";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { FileUploadField } from "@/components/shared/file-upload-field";
import { FormActions } from "@/components/shared/form-actions";
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
  finalistBannersFormSchema,
  saveFinalistBannersIntent,
  type FinalistBannersActionData,
  type FinalistBannersFormValues,
  type FinalistBannersLoaderData,
} from "./shared";

const formId = "finalist-banners-form";

const noPickedBanners: Record<GrandFinalBannerSlot, boolean> = {
  first: false,
  second: false,
};

/**
 * The two `Gran final` banners of one finalist academy: each shows the stored
 * picture, and is replaced by picking another or emptied with its delete
 * button. Both wait for `Guardar`, which stores both or neither.
 */
export function FinalistBannersView({
  actionData,
  loaderData,
}: {
  actionData?: FinalistBannersActionData;
  loaderData: FinalistBannersLoaderData;
}) {
  useServerActionToast(actionData);

  const navigation = useNavigation();
  const submit = useSubmit();
  const form = useForm<FinalistBannersFormValues>({
    defaultValues: loaderData.values,
    resolver: zodResolver(finalistBannersFormSchema),
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

  const isPending =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === saveFinalistBannersIntent;

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title={loaderData.academyName}
      description={`Subí las dos fotos que muestra la votación de la Gran final. ${grandFinalBannerRuleLabel}.`}
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
          method="post"
          encType="multipart/form-data"
          noValidate
          onSubmit={createValidatedReactRouterSubmitHandler(form, submit, {
            encType: "multipart/form-data",
            method: "post",
          })}
        >
          <input
            type="hidden"
            name="intent"
            value={saveFinalistBannersIntent}
          />
          <FieldGroup
            key={`${savedKey}:${discardCount}`}
            className="grid gap-5 md:grid-cols-2"
          >
            {grandFinalBannerSlots.map((slot) => (
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
                label="Elegí la foto o arrastrala acá"
                {...getAssetUploadFieldProps("grandFinalBanner", {
                  fieldLabel: grandFinalBannerSlotLabels[slot],
                })}
                helperText={`${grandFinalBannerRuleLabel}. ${getAssetKindHelperText("grandFinalBanner")}`}
              />
            ))}
          </FieldGroup>
        </form>
      </AdminResourceFormCard>
    </AdminResourceLayout>
  );
}
