import { CloudUpload, Trash2 } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentProps,
} from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";

type FileUploadFieldProps = Omit<ComponentProps<"input">, "type"> & {
  allowedMimeTypes: string[];
  existingPreviewUrl?: string | null;
  helperText: string;
  label: string;
  maxFileSizeBytes?: number;
  onStorageKeyChange?: (storageKey: string) => void;
  onValidationErrorChange?: (hasError: boolean) => void;
  storageKeyInputName?: string;
  storageKeyValue?: string;
};

export function FileUploadField({
  allowedMimeTypes,
  className,
  existingPreviewUrl,
  helperText,
  id: providedId,
  label,
  maxFileSizeBytes,
  onChange,
  onStorageKeyChange,
  onValidationErrorChange,
  storageKeyInputName,
  storageKeyValue = "",
  ...props
}: FileUploadFieldProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [currentStorageKey, setCurrentStorageKey] = useState(storageKeyValue);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const hasImage = selectedFileName !== null || currentStorageKey.length > 0;
  const displayedPreviewUrl =
    previewUrl ?? (currentStorageKey ? existingPreviewUrl : null);
  const showsFileActions = hasImage || errorMessage !== null;

  useEffect(() => {
    onValidationErrorChange?.(errorMessage !== null);
  }, [errorMessage, onValidationErrorChange]);

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
            className,
          )}
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();

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
                  {currentStorageKey ? "Imagen cargada" : label}
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
            aria-invalid={errorMessage ? true : undefined}
            className="sr-only"
            onChange={(event) => {
              handleSelectedFile(
                event.currentTarget,
                event.currentTarget.files?.[0] ?? null,
                event,
              );
            }}
          />
        </label>
        {showsFileActions ? (
          <Button
            type="button"
            variant="destructive"
            size="icon-sm"
            className="absolute top-2 right-2 z-10"
            onClick={clearFile}
          >
            <Trash2 aria-hidden="true" />
            <span className="sr-only">Borrar imagen</span>
          </Button>
        ) : null}
      </div>
      {errorMessage ? (
        <p className="text-sm text-destructive">{errorMessage}</p>
      ) : null}
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
      onChange?.(event as ChangeEvent<HTMLInputElement>);
      return;
    }

    const validationError = getFileValidationError(file);

    if (validationError) {
      input.value = "";
      setErrorMessage(validationError);
      setSelectedFileName(null);
      return;
    }

    setErrorMessage(null);
    setSelectedFileName(file.name);
    setPreviewUrl(createPreviewUrl(file));
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
      return "El archivo debe ser JPG, PNG o WEBP.";
    }

    if (maxFileSizeBytes !== undefined && file.size > maxFileSizeBytes) {
      return "El archivo no puede superar 10 MB.";
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
