import { CloudUpload, Download, Trash2 } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentProps,
} from "react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { FieldControlLockIcon } from "@/components/shared/field-lock-icon";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { cn } from "@/lib/shared/utils";

type FileUploadControlProps = Omit<ComponentProps<"input">, "type"> & {
  allowedMimeTypes: string[];
  downloadLabel?: string;
  downloadUrl?: string | null;
  error?: boolean;
  existingPreviewUrl?: string | null;
  helperText: string;
  invalidTypeMessage?: string;
  label: string;
  maxFileSizeBytes?: number;
  maxFileSizeMessage?: string;
  onSelectedFileChange?: (file: File | null) => void;
  onStorageKeyChange?: (storageKey: string) => void;
  onValidationErrorChange?: (hasError: boolean) => void;
  onValidationErrorMessageChange?: (message: string | null) => void;
  previewSelectedFile?: boolean;
  removeLabel?: string;
  storageKeyInputName?: string;
  storageKeyValue?: string;
  uploadedLabel?: string;
};

type FileUploadFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = Omit<
  FileUploadControlProps,
  | "error"
  | "name"
  | "onStorageKeyChange"
  | "onValidationErrorMessageChange"
  | "storageKeyValue"
> & {
  control: Control<TFieldValues>;
  fieldLabel: string;
  fileInputName: string;
  name: TName;
  onStorageKeyChange?: (storageKey: string) => void;
};

export function FileUploadField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  fieldLabel,
  fileInputName,
  name,
  onStorageKeyChange,
  onValidationErrorChange,
  storageKeyInputName,
  ...controlProps
}: FileUploadFieldProps<TFieldValues, TName>) {
  const generatedId = useId();
  const id = controlProps.id ?? generatedId;
  const [validationErrorMessage, setValidationErrorMessage] = useState<
    string | null
  >(null);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const storageKeyValue =
          typeof field.value === "string" ? field.value : "";
        const errorMessage =
          fieldState.error?.message ?? validationErrorMessage;
        const isInvalid = Boolean(errorMessage);

        return (
          <Field
            data-disabled={controlProps.disabled ? true : undefined}
            data-invalid={isInvalid ? true : undefined}
          >
            <FieldLabel htmlFor={id}>{fieldLabel}</FieldLabel>
            <FieldContent>
              <FileUploadControl
                {...controlProps}
                id={id}
                name={fileInputName}
                error={isInvalid}
                storageKeyInputName={storageKeyInputName ?? field.name}
                storageKeyValue={storageKeyValue}
                onBlur={field.onBlur}
                onStorageKeyChange={(storageKey) => {
                  field.onChange(storageKey);
                  onStorageKeyChange?.(storageKey);
                }}
                onValidationErrorChange={onValidationErrorChange}
                onValidationErrorMessageChange={setValidationErrorMessage}
              />
              <FieldError>{errorMessage}</FieldError>
            </FieldContent>
          </Field>
        );
      }}
    />
  );
}

function FileUploadControl({
  allowedMimeTypes,
  className,
  disabled = false,
  downloadLabel = "Descargar archivo",
  downloadUrl,
  error = false,
  existingPreviewUrl,
  helperText,
  id: providedId,
  invalidTypeMessage = "El archivo debe ser JPG, PNG o WEBP.",
  label,
  maxFileSizeBytes,
  maxFileSizeMessage = "El archivo no puede superar 10 MB.",
  onChange,
  onSelectedFileChange,
  onStorageKeyChange,
  onValidationErrorChange,
  onValidationErrorMessageChange,
  previewSelectedFile = true,
  removeLabel = "Borrar imagen",
  storageKeyInputName,
  storageKeyValue = "",
  uploadedLabel = "Imagen cargada",
  ...props
}: FileUploadControlProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [currentStorageKey, setCurrentStorageKey] = useState(storageKeyValue);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const hasImage = selectedFileName !== null || currentStorageKey.length > 0;
  const downloadHref = currentStorageKey.length > 0 ? downloadUrl : null;
  const displayedPreviewUrl =
    previewUrl ?? (currentStorageKey ? existingPreviewUrl : null);
  const showsFileActions = !disabled && (hasImage || errorMessage !== null);

  useEffect(() => {
    onValidationErrorChange?.(errorMessage !== null);
    onValidationErrorMessageChange?.(errorMessage);
  }, [errorMessage, onValidationErrorChange, onValidationErrorMessageChange]);

  useEffect(() => {
    setCurrentStorageKey(storageKeyValue);
  }, [storageKeyValue]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        revokePreviewUrl(previewUrl);
      }
    };
  }, [previewUrl]);

  return (
    <div className="flex flex-col gap-2">
      {storageKeyInputName ? (
        <input
          type="hidden"
          name={storageKeyInputName}
          value={currentStorageKey}
        />
      ) : null}
      <input
        type="hidden"
        name={`${props.name ?? id}ValidationError`}
        value={errorMessage ?? ""}
      />
      <div className="relative">
        <label
          htmlFor={id}
          className={cn(
            "flex min-h-36 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-input bg-background px-4 py-6 text-center transition-colors hover:bg-muted/50 focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/50 has-disabled:pointer-events-none has-disabled:cursor-not-allowed has-disabled:bg-input/50 has-disabled:opacity-50 has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20",
            displayedPreviewUrl && "px-3 py-3",
            disabled && "pr-9",
            className,
          )}
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();

            if (disabled) {
              return;
            }

            const input = inputRef.current;
            const files = event.dataTransfer.files;

            if (!input || files.length === 0) {
              return;
            }

            input.files = files;
            input.dispatchEvent(new Event("change", { bubbles: true }));
          }}
        >
          {displayedPreviewUrl ? (
            <img
              src={displayedPreviewUrl}
              alt={
                selectedFileName
                  ? `Vista previa de ${selectedFileName}`
                  : "Vista previa del documento"
              }
              className="max-h-72 w-full rounded-md object-contain"
            />
          ) : (
            <>
              <span className="flex size-12 items-center justify-center rounded-lg bg-brand text-white">
                <CloudUpload aria-hidden="true" />
              </span>
              <span className="flex flex-col gap-1">
                <span className="break-all text-sm font-medium text-foreground">
                  {selectedFileName ??
                    (currentStorageKey ? uploadedLabel : label)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {helperText}
                </span>
              </span>
            </>
          )}
          <input
            {...props}
            ref={inputRef}
            id={id}
            type="file"
            aria-invalid={error || errorMessage ? true : undefined}
            className="sr-only"
            disabled={disabled}
            onChange={(event) => {
              handleSelectedFile(
                event.currentTarget,
                event.currentTarget.files?.[0] ?? null,
                event,
              );
            }}
          />
          {disabled ? <FieldControlLockIcon /> : null}
        </label>
        {showsFileActions || downloadHref ? (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
            {downloadHref ? (
              <Button asChild variant="outline" size="icon-sm">
                <a href={downloadHref} target="_blank" rel="noreferrer">
                  <Download aria-hidden="true" data-icon />
                  <span className="sr-only">{downloadLabel}</span>
                </a>
              </Button>
            ) : null}
            {showsFileActions ? (
              <Button
                type="button"
                variant="destructive"
                size="icon-sm"
                onClick={clearFile}
              >
                <Trash2 aria-hidden="true" data-icon />
                <span className="sr-only">{removeLabel}</span>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );

  function handleSelectedFile(
    input: HTMLInputElement,
    file: File | null,
    event?: ChangeEvent<HTMLInputElement>,
  ) {
    clearPreview();

    if (!file) {
      setSelectedFileName(null);
      onSelectedFileChange?.(null);
      onChange?.(event as ChangeEvent<HTMLInputElement>);
      return;
    }

    const validationError = getFileValidationError(file);

    if (validationError) {
      input.value = "";
      setErrorMessage(validationError);
      setSelectedFileName(null);
      onSelectedFileChange?.(null);
      return;
    }

    setErrorMessage(null);
    setSelectedFileName(file.name);
    if (previewSelectedFile) {
      setPreviewUrl(createPreviewUrl(file));
    }
    onSelectedFileChange?.(file);
    onChange?.(event as ChangeEvent<HTMLInputElement>);
  }

  function clearFile() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }

    setCurrentStorageKey("");
    onStorageKeyChange?.("");
    setErrorMessage(null);
    setSelectedFileName(null);
    onSelectedFileChange?.(null);
    clearPreview();
  }

  function clearPreview() {
    setPreviewUrl((currentPreviewUrl) => {
      if (currentPreviewUrl) {
        revokePreviewUrl(currentPreviewUrl);
      }

      return null;
    });
  }

  function getFileValidationError(file: File) {
    if (!allowedMimeTypes.includes(file.type)) {
      return invalidTypeMessage;
    }

    if (maxFileSizeBytes !== undefined && file.size > maxFileSizeBytes) {
      return maxFileSizeMessage;
    }

    return null;
  }
}

function createPreviewUrl(file: File) {
  if (typeof URL.createObjectURL === "function") {
    return URL.createObjectURL(file);
  }

  return `preview:${file.name}`;
}

function revokePreviewUrl(previewUrl: string) {
  if (
    previewUrl.startsWith("blob:") &&
    typeof URL.revokeObjectURL === "function"
  ) {
    URL.revokeObjectURL(previewUrl);
  }
}
