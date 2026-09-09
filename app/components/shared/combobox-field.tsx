import {
  useEffect,
  useId,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { ChevronDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import {
  SharedFieldLayout,
  type SharedFieldOrientation,
} from "@/components/shared/field-layout";

// A combobox popup lives in a portal, so inside a dialog it is an outside
// press by default: clicking an option dismisses the dialog, and the layer
// above blocks pointer events on the search input. `MultiCombobox` solves
// this by portalling into the host `DialogContent` renders for exactly this
// purpose; a single-select combobox needs the same treatment.
const dialogCollisionAvoidance = {
  side: "none",
  align: "shift",
  fallbackAxisSide: "none",
} as const;

function useComboboxDialogHost(anchorRef: RefObject<HTMLDivElement | null>) {
  const [isInsideDialog, setIsInsideDialog] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );

  useEffect(() => {
    const dialogContent =
      anchorRef.current?.closest<HTMLElement>('[data-slot="dialog-content"]') ??
      null;

    setIsInsideDialog(dialogContent ? true : false);
    setPortalContainer(
      dialogContent?.querySelector<HTMLElement>(
        '[data-slot="dialog-combobox-portal-host"]',
      ) ?? null,
    );
  }, [anchorRef]);

  return { isInsideDialog, portalContainer };
}

type ComboboxFieldOption = {
  value: string;
  label: string;
};

type ComboboxFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TOption extends ComboboxFieldOption,
> = {
  className?: string;
  contentClassName?: string;
  contentProps?: Omit<ComponentProps<typeof ComboboxContent>, "anchor">;
  control: Control<TFieldValues>;
  description?: ReactNode;
  emptyMessage?: ReactNode;
  errorClassName?: string;
  id?: string;
  inputPlaceholder?: string;
  label: ReactNode;
  labelClassName?: string;
  name: TName;
  options: readonly TOption[];
  orientation?: SharedFieldOrientation;
  placeholder?: string;
  popupClassName?: string;
};

function ComboboxField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TOption extends ComboboxFieldOption,
>({
  className,
  contentClassName,
  contentProps,
  control,
  description,
  emptyMessage = "Sin resultados.",
  errorClassName,
  id: providedId,
  inputPlaceholder = "Buscar",
  label,
  labelClassName,
  name,
  options,
  orientation,
  placeholder = "Seleccionar",
  popupClassName,
}: ComboboxFieldProps<TFieldValues, TName, TOption>) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const anchorRef = useComboboxAnchor();
  const { isInsideDialog, portalContainer } = useComboboxDialogHost(anchorRef);
  const optionByValue = new Map(
    options.map((option) => [option.value, option] as const),
  );
  const optionValues = options.map((option) => option.value);

  function getOptionLabel(value: string) {
    return optionByValue.get(value)?.label ?? value;
  }

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const fieldValue = typeof field.value === "string" ? field.value : "";
        const errorMessage = fieldState.error?.message;

        return (
          <SharedFieldLayout
            className={className}
            contentClassName={contentClassName}
            description={description}
            error={errorMessage}
            errorClassName={errorClassName}
            id={id}
            label={label}
            labelClassName={labelClassName}
            orientation={orientation}
          >
            {({ describedBy, isInvalid }) => (
              <>
                <input type="hidden" name={field.name} value={fieldValue} />
                <Combobox
                  items={optionValues}
                  itemToStringLabel={getOptionLabel}
                  itemToStringValue={getOptionLabel}
                  value={fieldValue}
                  defaultValue={fieldValue}
                  onValueChange={field.onChange}
                >
                  {/* The anchor has to be a real element: the popup positions
                      against it, and inside a dialog it is also what locates
                      the dialog's portal host. */}
                  <div ref={anchorRef}>
                    <ComboboxTrigger
                      render={
                        <Button
                          variant="outline"
                          // A field, not a button: it keeps the arrow cursor,
                          // does not react to hover, and takes the brand ring
                          // on focus, like the control `MultiCombobox` builds
                          // out of `ComboboxChips`.
                          className="w-full cursor-default justify-between border-input font-normal hover:bg-background hover:text-foreground aria-expanded:bg-background aria-expanded:text-foreground focus-visible:border-brand focus-visible:ring-brand/50 dark:hover:bg-input/30 dark:aria-expanded:bg-input/30"
                          aria-describedby={describedBy || undefined}
                          aria-invalid={isInvalid ? true : undefined}
                        >
                          {fieldValue ? <ComboboxValue /> : placeholder}
                          <ChevronDownIcon
                            aria-hidden="true"
                            className="size-4 text-muted-foreground"
                          />
                        </Button>
                      }
                    />
                  </div>
                  <ComboboxContent
                    anchor={anchorRef}
                    className={popupClassName}
                    collisionAvoidance={
                      isInsideDialog ? dialogCollisionAvoidance : undefined
                    }
                    dismissableLayerBranch={isInsideDialog}
                    positionerClassName={
                      isInsideDialog ? "pointer-events-auto z-60" : undefined
                    }
                    portalContainer={portalContainer}
                    {...contentProps}
                  >
                    <ComboboxInput
                      id={id}
                      aria-invalid={isInvalid ? true : undefined}
                      placeholder={inputPlaceholder}
                      showTrigger={false}
                      onBlur={field.onBlur}
                    />
                    <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
                    <ComboboxList>
                      {(optionValue) => (
                        <ComboboxItem key={optionValue} value={optionValue}>
                          {getOptionLabel(optionValue)}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              </>
            )}
          </SharedFieldLayout>
        );
      }}
    />
  );
}

export { ComboboxField, type ComboboxFieldOption };
