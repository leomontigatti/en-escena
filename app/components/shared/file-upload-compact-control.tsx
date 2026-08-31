import { ExternalLink, Trash2 } from "lucide-react";

import { FieldLockIcon } from "@/components/shared/field-lock-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";

import type {
  FileUploadControlConfig,
  FileUploadControlState,
} from "./file-upload-control-types";

/**
 * The one-line variant: a box that reads as its own value. Empty it shows the
 * placeholder and opens the picker, holding a stored file it becomes the link
 * that opens it, and the remove button sits beside it rather than inside.
 */
export function FileUploadCompactControl({
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
    // The remove button sits beside the field rather than on top of it: it acts
    // on what the field holds, and inside the box it read as part of the value.
    <div className="flex items-center gap-2">
      <div
        className="relative min-w-0 flex-1"
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
        <FileUploadCompactValue
          config={config}
          state={state}
          showDownloadLink={Boolean(showDownloadLink)}
        />
        {config.disabled ? <FileUploadCompactLockIcon /> : null}
      </div>
      {config.disabled ? null : (
        <FileUploadCompactActions
          state={state}
          removeLabel={config.removeLabel}
        />
      )}
    </div>
  );
}

/**
 * Three shapes, one box. A stored file is a link that opens it, a locked field
 * is inert text, and anything else is the label that opens the picker.
 */
function FileUploadCompactValue({
  config,
  showDownloadLink,
  state,
}: {
  config: FileUploadControlConfig;
  showDownloadLink: boolean;
  state: FileUploadControlState;
}) {
  if (showDownloadLink) {
    return (
      <a
        href={state.downloadHref ?? undefined}
        target="_blank"
        rel="noreferrer"
        className={getFileUploadCompactClassName(config, state, true)}
      >
        <ExternalLink aria-hidden="true" className="size-3.5" />
        <span className="truncate">{config.downloadLabel}</span>
      </a>
    );
  }

  if (state.isReplaceLocked) {
    return (
      <span className={getFileUploadCompactClassName(config, state, false)}>
        <span className="truncate">{config.uploadedLabel}</span>
      </span>
    );
  }

  const label = getCompactFieldLabel(config, state);

  return (
    <label
      htmlFor={config.id}
      className={getFileUploadCompactClassName(config, state, true)}
    >
      <span
        className={cn(
          "truncate",
          label.isPlaceholder && "text-muted-foreground",
        )}
      >
        {label.text}
      </span>
    </label>
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
      className="shrink-0"
      onClick={state.clearFile}
    >
      <Trash2 aria-hidden="true" data-icon />
      <span className="sr-only">{removeLabel}</span>
    </Button>
  );
}

/**
 * What the box reads, and whether that text is standing in for a value it does
 * not have — the placeholder is muted, a real file name is not.
 */
function getCompactFieldLabel(
  config: FileUploadControlConfig,
  state: FileUploadControlState,
) {
  if (state.selectedFileName) {
    return { isPlaceholder: false, text: state.selectedFileName };
  }

  if (state.currentStorageKey) {
    return { isPlaceholder: false, text: config.uploadedLabel };
  }

  return { isPlaceholder: true, text: config.placeholder };
}

function getFileUploadCompactClassName(
  config: FileUploadControlConfig,
  state: FileUploadControlState,
  isInteractive: boolean,
) {
  return cn(
    "flex h-8 w-full min-w-0 items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none md:text-sm",
    !config.disabled &&
      isInteractive &&
      "cursor-pointer hover:bg-muted/50 focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/50",
    // Only the lock icon overlaps the box now, so only it needs the room.
    config.disabled && "bg-input/50 pr-9 opacity-50",
    (config.error || state.errorMessage) &&
      "border-destructive ring-3 ring-destructive/20",
    config.className,
  );
}
