import { CloudUpload, Download, ExternalLink, Trash2 } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentProps,
  type DragEvent,
  type RefObject,
} from "react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import {
  FieldControlLockIcon,
  FieldLockIcon,
} from "@/components/shared/field-lock-icon";
import { SharedFieldLayout } from "@/components/shared/field-layout";
import { Button } from "@/components/ui/button";
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
  variant?: "dropzone" | "compact";
};

type FileUploadInputProps = Omit<
  ComponentProps<"input">,
  "className" | "disabled" | "id" | "onChange" | "type"
>;

type FileUploadControlConfig = {
  allowedMimeTypes: string[];
  className?: string;
  disabled: boolean;
  downloadLabel: string;
  downloadUrl?: string | null;
  error: boolean;
  existingPreviewUrl?: string | null;
  helperText: string;
  id: string;
  inputProps: FileUploadInputProps;
  invalidTypeMessage: string;
  label: string;
  maxFileSizeBytes?: number;
  maxFileSizeMessage: string;
  onChange?: ComponentProps<"input">["onChange"];
  onSelectedFileChange?: (file: File | null) => void;
  onStorageKeyChange?: (storageKey: string) => void;
  onValidationErrorChange?: (hasError: boolean) => void;
  onValidationErrorMessageChange?: (message: string | null) => void;
  previewSelectedFile: boolean;
  removeLabel: string;
  storageKeyInputName?: string;
  storageKeyValue: string;
  uploadedLabel: string;
  validationErrorInputName: string;
  variant: "dropzone" | "compact";
};

type FileUploadControlState = {
  clearFile: () => void;
  currentStorageKey: string;
  displayedPreviewUrl: string | null;
  downloadHref: string | null;
  errorMessage: string | null;
  handleDragOver: (event: DragEvent<HTMLElement>) => void;
  handleDrop: (event: DragEvent<HTMLElement>) => void;
  handleFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  previewAlt: string;
  selectedFileName: string | null;
  showsFileActions: boolean;
  uploadLabel: string;
};

type FileUploadControlDerivedState = Pick<
  FileUploadControlState,
  | "displayedPreviewUrl"
  | "downloadHref"
  | "previewAlt"
  | "showsFileActions"
  | "uploadLabel"
>;

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

        return (
          <SharedFieldLayout
            disabled={controlProps.disabled}
            error={errorMessage}
            id={id}
            label={fieldLabel}
          >
            {({ describedBy, isInvalid }) => (
              <FileUploadControl
                {...controlProps}
                id={id}
                aria-describedby={describedBy || undefined}
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
            )}
          </SharedFieldLayout>
        );
      }}
    />
  );
}

function FileUploadControl(props: FileUploadControlProps) {
  const generatedId = useId();
  const config = getFileUploadControlConfig(props, generatedId);
  const state = useFileUploadControlState(config);

  return (
    <div className="flex flex-col gap-2">
      <FileUploadHiddenInputs config={config} state={state} />
      {config.variant === "compact" ? (
        <FileUploadCompactControl config={config} state={state} />
      ) : (
        <div className="relative">
          <FileUploadDropzone config={config} state={state} />
          <FileUploadActions config={config} state={state} />
        </div>
      )}
    </div>
  );
}

function getFileUploadControlConfig(
  {
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
    variant = "dropzone",
    ...inputProps
  }: FileUploadControlProps,
  generatedId: string,
): FileUploadControlConfig {
  const id = providedId ?? generatedId;

  return {
    allowedMimeTypes,
    className,
    disabled,
    downloadLabel,
    downloadUrl,
    error,
    existingPreviewUrl,
    helperText,
    id,
    inputProps,
    invalidTypeMessage,
    label,
    maxFileSizeBytes,
    maxFileSizeMessage,
    onChange,
    onSelectedFileChange,
    onStorageKeyChange,
    onValidationErrorChange,
    onValidationErrorMessageChange,
    previewSelectedFile,
    removeLabel,
    storageKeyInputName,
    storageKeyValue,
    uploadedLabel,
    validationErrorInputName: `${inputProps.name ?? id}ValidationError`,
    variant,
  };
}

function useFileUploadControlState(
  config: FileUploadControlConfig,
): FileUploadControlState {
  const inputRef = useRef<HTMLInputElement>(null);
  const [currentStorageKey, setCurrentStorageKey] = useState(
    config.storageKeyValue,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const derivedState = getFileUploadControlDerivedState({
    config,
    currentStorageKey,
    errorMessage,
    previewUrl,
    selectedFileName,
  });

  useEffect(() => {
    config.onValidationErrorChange?.(errorMessage !== null);
    config.onValidationErrorMessageChange?.(errorMessage);
  }, [
    errorMessage,
    config.onValidationErrorChange,
    config.onValidationErrorMessageChange,
  ]);

  useEffect(() => {
    setCurrentStorageKey(config.storageKeyValue);
  }, [config.storageKeyValue]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        revokePreviewUrl(previewUrl);
      }
    };
  }, [previewUrl]);

  return {
    clearFile,
    currentStorageKey,
    errorMessage,
    handleDragOver,
    handleDrop,
    handleFileInputChange,
    inputRef,
    selectedFileName,
    ...derivedState,
  };

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();

    if (config.disabled) {
      return;
    }

    const input = inputRef.current;
    const files = event.dataTransfer.files;

    if (!input || files.length === 0) {
      return;
    }

    input.files = files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    handleSelectedFile(
      event.currentTarget,
      event.currentTarget.files?.[0] ?? null,
      event,
    );
  }

  function handleSelectedFile(
    input: HTMLInputElement,
    file: File | null,
    event?: ChangeEvent<HTMLInputElement>,
  ) {
    clearPreview();

    if (!file) {
      setSelectedFileName(null);
      config.onSelectedFileChange?.(null);
      config.onChange?.(event as ChangeEvent<HTMLInputElement>);
      return;
    }

    const validationError = getFileValidationError(file);

    if (validationError) {
      input.value = "";
      setErrorMessage(validationError);
      setSelectedFileName(null);
      config.onSelectedFileChange?.(null);
      return;
    }

    setErrorMessage(null);
    setSelectedFileName(file.name);
    if (config.previewSelectedFile) {
      setPreviewUrl(createPreviewUrl(file));
    }
    config.onSelectedFileChange?.(file);
    config.onChange?.(event as ChangeEvent<HTMLInputElement>);
  }

  function clearFile() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }

    setCurrentStorageKey("");
    config.onStorageKeyChange?.("");
    setErrorMessage(null);
    setSelectedFileName(null);
    config.onSelectedFileChange?.(null);
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
    if (!config.allowedMimeTypes.includes(file.type)) {
      return config.invalidTypeMessage;
    }

    if (
      config.maxFileSizeBytes !== undefined &&
      file.size > config.maxFileSizeBytes
    ) {
      return config.maxFileSizeMessage;
    }

    return null;
  }
}

function getFileUploadControlDerivedState({
  config,
  currentStorageKey,
  errorMessage,
  previewUrl,
  selectedFileName,
}: {
  config: FileUploadControlConfig;
  currentStorageKey: string;
  errorMessage: string | null;
  previewUrl: string | null;
  selectedFileName: string | null;
}): FileUploadControlDerivedState {
  return {
    displayedPreviewUrl: getDisplayedPreviewUrl({
      currentStorageKey,
      existingPreviewUrl: config.existingPreviewUrl,
      previewUrl,
    }),
    downloadHref: getDownloadHref(currentStorageKey, config.downloadUrl),
    previewAlt: getPreviewAlt(selectedFileName),
    showsFileActions: getShowsFileActions({
      currentStorageKey,
      disabled: config.disabled,
      errorMessage,
      selectedFileName,
    }),
    uploadLabel: getUploadLabel({
      currentStorageKey,
      label: config.label,
      selectedFileName,
      uploadedLabel: config.uploadedLabel,
    }),
  };
}

function getDisplayedPreviewUrl({
  currentStorageKey,
  existingPreviewUrl,
  previewUrl,
}: {
  currentStorageKey: string;
  existingPreviewUrl?: string | null;
  previewUrl: string | null;
}) {
  if (previewUrl) {
    return previewUrl;
  }

  if (!currentStorageKey) {
    return null;
  }

  return existingPreviewUrl ?? null;
}

function getDownloadHref(
  currentStorageKey: string,
  downloadUrl: string | null | undefined,
) {
  if (!currentStorageKey) {
    return null;
  }

  return downloadUrl ?? null;
}

function getPreviewAlt(selectedFileName: string | null) {
  if (selectedFileName) {
    return `Vista previa de ${selectedFileName}`;
  }

  return "Vista previa del documento";
}

function getShowsFileActions({
  currentStorageKey,
  disabled,
  errorMessage,
  selectedFileName,
}: {
  currentStorageKey: string;
  disabled: boolean;
  errorMessage: string | null;
  selectedFileName: string | null;
}) {
  if (disabled) {
    return false;
  }

  return (
    selectedFileName !== null ||
    currentStorageKey.length > 0 ||
    errorMessage !== null
  );
}

function getUploadLabel({
  currentStorageKey,
  label,
  selectedFileName,
  uploadedLabel,
}: {
  currentStorageKey: string;
  label: string;
  selectedFileName: string | null;
  uploadedLabel: string;
}) {
  if (selectedFileName) {
    return selectedFileName;
  }

  if (currentStorageKey) {
    return uploadedLabel;
  }

  return label;
}

function FileUploadHiddenInputs({
  config,
  state,
}: {
  config: FileUploadControlConfig;
  state: FileUploadControlState;
}) {
  return (
    <>
      {config.storageKeyInputName ? (
        <input
          type="hidden"
          name={config.storageKeyInputName}
          value={state.currentStorageKey}
        />
      ) : null}
      <input
        type="hidden"
        name={config.validationErrorInputName}
        value={state.errorMessage ?? ""}
      />
    </>
  );
}

function FileUploadCompactControl({
  config,
  state,
}: {
  config: FileUploadControlConfig;
  state: FileUploadControlState;
}) {
  const showDownloadLink =
    state.downloadHref &&
    state.selectedFileName === null &&
    !state.errorMessage;

  return (
    <div
      className="relative"
      onDragOver={state.handleDragOver}
      onDrop={state.handleDrop}
    >
      <input
        {...config.inputProps}
        ref={state.inputRef}
        id={config.id}
        type="file"
        aria-invalid={config.error || state.errorMessage ? true : undefined}
        className="sr-only"
        disabled={config.disabled}
        onChange={state.handleFileInputChange}
      />
      {showDownloadLink ? (
        <a
          href={state.downloadHref ?? undefined}
          target="_blank"
          rel="noreferrer"
          className={getFileUploadCompactClassName(config, state)}
        >
          <ExternalLink aria-hidden="true" className="size-3.5" />
          <span className="truncate">{config.downloadLabel}</span>
        </a>
      ) : (
        <label
          htmlFor={config.id}
          className={getFileUploadCompactClassName(config, state)}
        >
          <span className="truncate">
            {getCompactFieldLabel(config, state)}
          </span>
        </label>
      )}
      {config.disabled ? (
        <FileUploadCompactLockIcon />
      ) : (
        <FileUploadCompactActions
          state={state}
          removeLabel={config.removeLabel}
        />
      )}
    </div>
  );
}

function FileUploadCompactLockIcon() {
  return (
    <span className="pointer-events-none absolute top-1/2 right-3 flex size-4 -translate-y-1/2 items-center justify-center">
      <FieldLockIcon className="size-3" />
    </span>
  );
}

function FileUploadCompactActions({
  removeLabel,
  state,
}: {
  removeLabel: string;
  state: FileUploadControlState;
}) {
  if (!state.showsFileActions) {
    return null;
  }

  return (
    <Button
      type="button"
      variant="destructive"
      size="icon-sm"
      className="absolute top-1/2 right-1 -translate-y-1/2"
      onClick={state.clearFile}
    >
      <Trash2 aria-hidden="true" data-icon />
      <span className="sr-only">{removeLabel}</span>
    </Button>
  );
}

function getCompactFieldLabel(
  config: FileUploadControlConfig,
  state: FileUploadControlState,
) {
  if (state.selectedFileName) {
    return state.selectedFileName;
  }

  if (state.currentStorageKey) {
    return config.uploadedLabel;
  }

  return "";
}

function getFileUploadCompactClassName(
  config: FileUploadControlConfig,
  state: FileUploadControlState,
) {
  return cn(
    "flex h-8 w-full min-w-0 items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-1 pr-9 text-base transition-colors outline-none md:text-sm",
    !config.disabled &&
      "cursor-pointer hover:bg-muted/50 focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/50",
    config.disabled && "bg-input/50 opacity-50",
    (config.error || state.errorMessage) &&
      "border-destructive ring-3 ring-destructive/20",
    config.className,
  );
}

function FileUploadDropzone({
  config,
  state,
}: {
  config: FileUploadControlConfig;
  state: FileUploadControlState;
}) {
  return (
    <label
      htmlFor={config.id}
      className={getFileUploadDropzoneClassName(config, state)}
      onDragOver={state.handleDragOver}
      onDrop={state.handleDrop}
    >
      {state.displayedPreviewUrl ? (
        <FileUploadPreview state={state} />
      ) : (
        <FileUploadPlaceholder config={config} state={state} />
      )}
      <input
        {...config.inputProps}
        ref={state.inputRef}
        id={config.id}
        type="file"
        aria-invalid={config.error || state.errorMessage ? true : undefined}
        className="sr-only"
        disabled={config.disabled}
        onChange={state.handleFileInputChange}
      />
      {config.disabled ? <FieldControlLockIcon /> : null}
    </label>
  );
}

function FileUploadPreview({ state }: { state: FileUploadControlState }) {
  return (
    <img
      src={state.displayedPreviewUrl ?? ""}
      alt={state.previewAlt}
      className="max-h-72 w-full rounded-md object-contain"
    />
  );
}

function FileUploadPlaceholder({
  config,
  state,
}: {
  config: FileUploadControlConfig;
  state: FileUploadControlState;
}) {
  return (
    <>
      <span className="flex size-12 items-center justify-center rounded-lg bg-brand text-white">
        <CloudUpload aria-hidden="true" />
      </span>
      <span className="flex flex-col gap-1">
        <span className="break-all text-sm font-medium text-foreground">
          {state.uploadLabel}
        </span>
        <span className="text-xs text-muted-foreground">
          {config.helperText}
        </span>
      </span>
    </>
  );
}

function FileUploadActions({
  config,
  state,
}: {
  config: FileUploadControlConfig;
  state: FileUploadControlState;
}) {
  if (!state.showsFileActions && !state.downloadHref) {
    return null;
  }

  return (
    <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
      {state.downloadHref ? (
        <Button asChild variant="outline" size="icon-sm">
          <a href={state.downloadHref} target="_blank" rel="noreferrer">
            <Download aria-hidden="true" data-icon />
            <span className="sr-only">{config.downloadLabel}</span>
          </a>
        </Button>
      ) : null}
      {state.showsFileActions ? (
        <Button
          type="button"
          variant="destructive"
          size="icon-sm"
          onClick={state.clearFile}
        >
          <Trash2 aria-hidden="true" data-icon />
          <span className="sr-only">{config.removeLabel}</span>
        </Button>
      ) : null}
    </div>
  );
}

function getFileUploadDropzoneClassName(
  config: FileUploadControlConfig,
  state: FileUploadControlState,
) {
  return cn(
    "flex min-h-36 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-input bg-background px-4 py-6 text-center transition-colors hover:bg-muted/50 focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/50 has-disabled:pointer-events-none has-disabled:cursor-not-allowed has-disabled:bg-input/50 has-disabled:opacity-50 has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20",
    state.displayedPreviewUrl && "px-3 py-3",
    config.disabled && "pr-9",
    config.className,
  );
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
