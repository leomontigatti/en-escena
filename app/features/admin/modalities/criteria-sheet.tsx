import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft, Plus, Trash2, Undo2 } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import {
  useFieldArray,
  useForm,
  useFormState,
  useWatch,
  type UseFormReturn,
} from "react-hook-form";

import { SubmitButton } from "@/components/shared/action-buttons";
import {
  DiscardChangesDialog,
  useDiscardGuard,
} from "@/components/shared/discard-guard";
import { IntegerInputField } from "@/components/shared/integer-input-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import {
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field";
import {
  experienceLevelLabel,
  type ExperienceLevel,
} from "@/lib/events/experience-levels";
import {
  addingCriteriaTotal,
  sumAddingCriteriaMaxima,
  type CriterionKind,
} from "@/lib/judging/criteria";
import {
  generalEvaluationLabel,
  sheetRuleFor,
  sheetTotalError,
  type OfferedSheets,
} from "@/lib/judging/sheet-criteria";
import {
  createValidatedRouteFormDataSubmitHandler,
  isRouteFormPending,
  useOptionalFormAction,
  useOptionalNavigation,
  useOptionalSubmit,
  useSavedFormValues,
} from "@/lib/shared/forms";
import { cn } from "@/lib/shared/utils";

import type { EventSubmodalityCriterionRow } from "./shared";
import {
  buildSheetCriteriaFormSchema,
  type SheetCriteriaFormValues,
} from "./view-shared";

type SheetForm = UseFormReturn<SheetCriteriaFormValues>;

/**
 * One sheet of a submodality, saved on its own: what adds above the separator,
 * what deducts below, each with its own add button, so a criterion's kind is
 * where it sits rather than a field. A level's counter reads the general
 * criteria's share beside its own, because its own are what is left to reach
 * 100; only that own share can be wrong here, so only it turns red.
 */
export function SheetCriteriaView({
  criteria,
  experienceLevel,
  locked,
  modalityId,
  onBack,
  onClose,
  requestCloseRef,
  sheets,
  submodalityId,
}: {
  criteria: EventSubmodalityCriterionRow[];
  experienceLevel: ExperienceLevel | null;
  locked: boolean;
  modalityId: string;
  onBack: () => void;
  onClose: () => void;
  requestCloseRef: RefObject<(() => void) | null>;
  sheets: OfferedSheets;
  submodalityId: string;
}) {
  const sheet = useSheetCriteriaForm({
    criteria,
    experienceLevel,
    onBack,
    onClose,
    requestCloseRef,
    sheets,
    submodalityId,
  });
  const formId = `submodality-criteria-form-${submodalityId}`;

  return (
    <>
      <div className="flex flex-col gap-5">
        <h3 className="text-base font-semibold">
          {experienceLevel === null
            ? generalEvaluationLabel
            : (experienceLevelLabel(experienceLevel) ?? experienceLevel)}
        </h3>
        <form
          id={formId}
          method="post"
          // The dialog is portalled out of the modality form but still inside
          // it in React's tree, so its submit would bubble to that form's
          // handler and be posted again without this sheet's validation.
          onSubmit={(event) => {
            event.stopPropagation();
            sheet.submit(event);
          }}
        >
          <input
            type="hidden"
            name="intent"
            value="save-submodality-criteria"
          />
          <input type="hidden" name="id" value={submodalityId} />
          <input type="hidden" name="modalityId" value={modalityId} />
          <input
            type="hidden"
            name="experienceLevel"
            value={experienceLevel ?? ""}
          />
          <SheetFields
            fixedAddingTotal={
              experienceLevel === null ? null : sheet.rule.fixedAddingTotal
            }
            form={sheet.form}
            locked={locked}
            saving={sheet.isSaving}
            totalErrorOf={(values) => sheetTotalError(values, sheet.rule)}
          />
        </form>
        <SheetFooter
          formId={formId}
          isDirty={sheet.isDirty}
          isSaving={sheet.isSaving}
          locked={locked}
          onBack={sheet.backGuard.requestClose}
          onDiscard={sheet.discard}
        />
      </div>
      <DiscardChangesDialog {...sheet.backGuard.discardDialogProps} />
      <DiscardChangesDialog {...sheet.closeGuard.discardDialogProps} />
    </>
  );
}

/**
 * The sheet's draft and how it leaves: saved, discarded, or abandoned through
 * `Volver` or the dialog's own close, both of which ask over unsaved changes.
 */
function useSheetCriteriaForm({
  criteria,
  experienceLevel,
  onBack,
  onClose,
  requestCloseRef,
  sheets,
  submodalityId,
}: {
  criteria: EventSubmodalityCriterionRow[];
  experienceLevel: ExperienceLevel | null;
  onBack: () => void;
  onClose: () => void;
  requestCloseRef: RefObject<(() => void) | null>;
  sheets: OfferedSheets;
  submodalityId: string;
}) {
  const rule = useMemo(
    () => sheetRuleFor(experienceLevel, criteria, sheets),
    [criteria, experienceLevel, sheets],
  );
  const saved = useMemo(
    (): SheetCriteriaFormValues => ({
      criteria: criteria
        .filter((criterion) => criterion.experienceLevel === experienceLevel)
        .map((criterion) => ({
          kind: criterion.kind,
          maximum: String(criterion.maximum),
          name: criterion.name,
        })),
    }),
    [criteria, experienceLevel],
  );
  const form = useForm<SheetCriteriaFormValues>({
    defaultValues: saved,
    mode: "onSubmit",
    resolver: zodResolver(buildSheetCriteriaFormSchema(rule)),
  });
  const { isDirty } = useFormState({ control: form.control });
  const formAction = useOptionalFormAction();
  const submit = useOptionalSubmit();
  const isSaving = isRouteFormPending(useOptionalNavigation(), {
    fields: { experienceLevel: experienceLevel ?? "", id: submodalityId },
    intent: "save-submodality-criteria",
  });
  const backGuard = useDiscardGuard({
    isAudioDirty: false,
    isFormDirty: isDirty,
    onClose: onBack,
  });
  const closeGuard = useDiscardGuard({
    isAudioDirty: false,
    isFormDirty: isDirty,
    onClose,
  });

  // Compared by content: the loader hands a new array on every revalidation.
  useSavedFormValues(form, saved);
  const lastSubmit = useBackAfterSave({ form, onBack, saved });

  // Esc and the close button are held while saving, and ask over a draft.
  useEffect(() => {
    requestCloseRef.current = isSaving ? () => {} : closeGuard.requestClose;

    return () => {
      requestCloseRef.current = null;
    };
  }, [closeGuard.requestClose, isSaving, requestCloseRef]);

  return {
    backGuard,
    closeGuard,
    discard: () => {
      lastSubmit.forget();
      form.reset();
    },
    form,
    isDirty,
    isSaving,
    rule,
    submit: createValidatedRouteFormDataSubmitHandler(
      form,
      (target, options) => {
        lastSubmit.remember();
        return submit(target, options);
      },
      formAction,
    ),
  };
}

function SheetFooter({
  formId,
  isDirty,
  isSaving,
  locked,
  onBack,
  onDiscard,
}: {
  formId: string;
  isDirty: boolean;
  isSaving: boolean;
  locked: boolean;
  onBack: () => void;
  onDiscard: () => void;
}) {
  return (
    <DialogFooter className="sm:justify-between">
      <Button
        type="button"
        variant="outline"
        disabled={isSaving}
        onClick={onBack}
      >
        <ChevronLeft aria-hidden="true" data-icon="inline-start" />
        Volver
      </Button>
      {locked ? null : (
        <div className="flex gap-2">
          {isDirty ? (
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={onDiscard}
            >
              <Undo2 aria-hidden="true" data-icon="inline-start" />
              Descartar cambios
            </Button>
          ) : null}
          <SubmitButton
            disabled={!isDirty}
            form={formId}
            isPending={isSaving}
          />
        </div>
      )}
    </DialogFooter>
  );
}

/**
 * Back to the list once a save has landed. The save revalidates the page, so
 * once it lands the stored sheet is what was submitted; a refused one leaves
 * the stored sheet as it was, and the editor stays on what was typed. Read off
 * the stored sheet rather than the navigation's state, which a quick action can
 * pass through without a render.
 */
function useBackAfterSave({
  form,
  onBack,
  saved,
}: {
  form: SheetForm;
  onBack: () => void;
  saved: SheetCriteriaFormValues;
}) {
  const submitted = useRef(false);
  const { getValues } = form;

  useEffect(() => {
    if (submitted.current && sameSheet(getValues(), saved)) {
      submitted.current = false;
      onBack();
    }
  }, [getValues, onBack, saved]);

  return {
    forget: () => {
      submitted.current = false;
    },
    remember: () => {
      submitted.current = true;
    },
  };
}

/** Compared as the save stores them: names title-cased, maxima as numbers. */
function sameSheet(
  typed: SheetCriteriaFormValues,
  saved: SheetCriteriaFormValues,
) {
  const key = (values: SheetCriteriaFormValues) =>
    JSON.stringify(
      values.criteria.map((criterion) => [
        criterion.kind,
        Number.parseInt(criterion.maximum, 10),
        criterion.name.trim().toLocaleLowerCase("es"),
      ]),
    );

  return key(typed) === key(saved);
}

function SheetFields({
  fixedAddingTotal,
  form,
  locked,
  saving,
  totalErrorOf,
}: {
  /** The general criteria's share on a level sheet; null on the general one. */
  fixedAddingTotal: number | null;
  form: SheetForm;
  locked: boolean;
  /** While a save is in flight: an edit then would be dropped when it lands. */
  saving: boolean;
  /** Why the typed sheet does not add up, or null; the save asks the same. */
  totalErrorOf: (
    criteria: SheetCriteriaFormValues["criteria"],
  ) => string | null;
}) {
  const { append, fields, remove } = useFieldArray({
    control: form.control,
    keyName: "fieldId",
    name: "criteria",
  });
  const values = useWatch({ control: form.control, name: "criteria" }) ?? [];
  // Read off the typed sheet rather than the submit's errors, which hold a
  // whole-list error until the next submit: once `Guardar` has been pressed,
  // the message follows what is typed, as a field's own error does.
  const liveTotalError = totalErrorOf(values);
  const totalError = form.formState.isSubmitted ? liveTotalError : null;
  const rowsOf = (kind: CriterionKind) =>
    fields.flatMap((field, index) =>
      field.kind === kind ? [{ fieldId: field.fieldId, index }] : [],
    );
  const section = (kind: CriterionKind) => ({
    form,
    kind,
    locked,
    onAppend: () => append({ kind, maximum: "", name: "" }),
    saving,
    onRemove: remove,
    rows: rowsOf(kind),
  });

  return (
    <FieldGroup>
      <KindSection
        {...section("adds")}
        addLabel="Agregar criterio que suma"
        error={totalError}
      >
        <FieldLegend
          variant="label"
          className={cn(
            "flex w-full items-center justify-between",
            totalError ? "text-destructive" : undefined,
          )}
        >
          Suman
          <AddingCounter
            complete={liveTotalError === null}
            fixedAddingTotal={fixedAddingTotal}
            ownTotal={sumAddingCriteriaMaxima(values)}
          />
        </FieldLegend>
      </KindSection>
      <FieldSeparator />
      <KindSection
        {...section("deducts")}
        addLabel="Agregar criterio que descuenta"
      >
        <FieldLegend variant="label">Descuentan</FieldLegend>
      </KindSection>
    </FieldGroup>
  );
}

/** Only the sheet's own share can be wrong here, so only it turns red. */
function AddingCounter({
  complete,
  fixedAddingTotal,
  ownTotal,
}: {
  complete: boolean;
  fixedAddingTotal: number | null;
  ownTotal: number;
}) {
  return (
    <span className="font-medium" role="status">
      {fixedAddingTotal === null ? null : (
        <span className="text-muted-foreground">{`${fixedAddingTotal} + `}</span>
      )}
      <span className={complete ? undefined : "text-destructive"}>
        {ownTotal}
      </span>
      <span className="text-muted-foreground">{` / ${addingCriteriaTotal}`}</span>
    </span>
  );
}

/** One kind's rows under its legend, with the button that adds one of that kind. */
function KindSection({
  addLabel,
  children,
  error = null,
  form,
  kind,
  locked,
  onAppend,
  onRemove,
  rows,
  saving,
}: {
  addLabel: string;
  children: ReactNode;
  error?: string | null;
  form: SheetForm;
  kind: CriterionKind;
  locked: boolean;
  onAppend: () => void;
  onRemove: (index: number) => void;
  rows: { fieldId: string; index: number }[];
  saving: boolean;
}) {
  return (
    <FieldSet className="gap-2" data-invalid={error ? true : undefined}>
      {children}
      {error ? <FieldError>{error}</FieldError> : null}
      {rows.map(({ fieldId, index }) => (
        <CriterionRow
          form={form}
          index={index}
          key={fieldId}
          kind={kind}
          locked={locked}
          onRemove={() => onRemove(index)}
          saving={saving}
        />
      ))}
      {locked ? null : (
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          aria-label={addLabel}
          disabled={saving}
          onClick={onAppend}
        >
          <Plus aria-hidden="true" data-icon="inline-start" />
          Agregar criterio
        </Button>
      )}
    </FieldSet>
  );
}

function CriterionRow({
  form,
  index,
  kind,
  locked,
  onRemove,
  saving,
}: {
  form: SheetForm;
  index: number;
  kind: CriterionKind;
  locked: boolean;
  onRemove: () => void;
  saving: boolean;
}) {
  return (
    <FieldGroup className="grid grid-cols-[minmax(0,1fr)_6rem_2rem] items-start gap-2">
      {/* The kind is where the row sits, not a field, so the post carries it here. */}
      <input type="hidden" name={`criteria.${index}.kind`} value={kind} />
      <TextInputField
        control={form.control}
        disabled={locked}
        id={`criterion-name-${index}`}
        label="Criterio"
        placeholder="Criterio"
        readOnly={saving}
        labelClassName="sr-only"
        name={`criteria.${index}.name`}
      />
      <IntegerInputField
        control={form.control}
        disabled={locked}
        id={`criterion-maximum-${index}`}
        label="Máximo"
        placeholder="Máximo"
        readOnly={saving}
        labelClassName="sr-only"
        name={`criteria.${index}.maximum`}
      />
      {locked ? null : (
        <Button
          type="button"
          variant="destructive"
          size="icon"
          aria-label="Quitar criterio"
          disabled={saving}
          onClick={onRemove}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      )}
    </FieldGroup>
  );
}
