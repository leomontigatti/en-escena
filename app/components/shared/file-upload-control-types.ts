import type { ChangeEvent, ComponentProps, DragEvent, RefObject } from "react";

// The contract between `FileUploadField` and the two variants that render it.
// Extracted so the compact control can be its own module without either half
// importing the other.

export type FileUploadControlProps = Omit<ComponentProps<"input">, "type"> & {
  // Optional so a download-only field can omit the whole validation set. The
  // policy itself belongs to the asset kind, never to this generic component:
  // see `getAssetUploadFieldProps` in `@/lib/storage/asset-kinds`.
  allowedMimeTypes?: string[];
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
  /** Compact only: what the empty field reads, e.g. the accepted format. */
  placeholder?: string;
  previewSelectedFile?: boolean;
  removeLabel?: string;
  /**
   * A stored file has to be removed before another can replace it. The field
   * stops offering its picker and refuses drops until the remove button is
   * pressed, so a replacement is always two deliberate steps.
   */
  replaceRequiresRemoval?: boolean;
  storageKeyInputName?: string;
  storageKeyValue?: string;
  uploadedLabel?: string;
  variant?: "dropzone" | "compact";
};

export type FileUploadInputProps = Omit<
  ComponentProps<"input">,
  "className" | "disabled" | "id" | "onChange" | "type"
>;

export type FileUploadControlConfig = {
  allowedMimeTypes?: string[];
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
  placeholder: string;
  previewSelectedFile: boolean;
  removeLabel: string;
  replaceRequiresRemoval: boolean;
  storageKeyInputName?: string;
  storageKeyValue: string;
  uploadedLabel: string;
  validationErrorInputName: string;
  variant: "dropzone" | "compact";
};

export type FileUploadControlState = {
  clearFile: () => void;
  currentStorageKey: string;
  isReplaceLocked: boolean;
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

export type FileUploadControlDerivedState = Pick<
  FileUploadControlState,
  | "displayedPreviewUrl"
  | "downloadHref"
  | "isReplaceLocked"
  | "previewAlt"
  | "showsFileActions"
  | "uploadLabel"
>;
