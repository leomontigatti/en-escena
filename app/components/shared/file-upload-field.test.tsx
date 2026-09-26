// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { useForm } from "react-hook-form";
import { describe, expect, test, vi } from "vitest";

import { getAssetUploadFieldProps } from "@/lib/storage/asset-kinds";

import { FileUploadField } from "./file-upload-field";

type TestFormValues = {
  documentFrontImageStorageKey: string;
};

function TestFileUploadField({
  defaultStorageKey = "",
  disabled = false,
  downloadLabel,
  downloadUrl,
  existingPreviewUrl,
  onStorageKeyChange,
  onValidationErrorChange,
  variant,
}: {
  defaultStorageKey?: string;
  disabled?: boolean;
  downloadLabel?: string;
  downloadUrl?: string;
  existingPreviewUrl?: string;
  onStorageKeyChange?: (storageKey: string) => void;
  onValidationErrorChange?: (hasError: boolean) => void;
  variant?: "dropzone" | "compact";
}) {
  const form = useForm<TestFormValues>({
    defaultValues: {
      documentFrontImageStorageKey: defaultStorageKey,
    },
  });

  return (
    <FileUploadField
      control={form.control}
      name="documentFrontImageStorageKey"
      fileInputName="documentFrontImage"
      fieldLabel="Frente del documento"
      disabled={disabled}
      downloadLabel={downloadLabel}
      downloadUrl={downloadUrl}
      label="Arrastrá o hacé click"
      {...getAssetUploadFieldProps("dancerDocumentImage")}
      existingPreviewUrl={existingPreviewUrl}
      onStorageKeyChange={onStorageKeyChange}
      onValidationErrorChange={onValidationErrorChange}
      variant={variant}
    />
  );
}

describe("FileUploadField", () => {
  test("notifies when an existing storage key is cleared", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const handleStorageKeyChange = vi.fn();

    await act(async () => {
      root.render(
        <TestFileUploadField
          defaultStorageKey="dancers/document-front.jpg"
          existingPreviewUrl="https://storage.example/document-front.jpg"
          onStorageKeyChange={handleStorageKeyChange}
        />,
      );
    });

    const deleteButton = container.querySelector<HTMLButtonElement>(
      'button[data-variant="destructive"]',
    );

    if (!deleteButton) {
      throw new Error("Expected delete button to render.");
    }

    await act(async () => {
      deleteButton.click();
    });

    expect(handleStorageKeyChange).toHaveBeenCalledWith("");
    expect(
      container.querySelector<HTMLInputElement>(
        'input[name="documentFrontImageStorageKey"]',
      ),
    ).toHaveProperty("value", "");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  test("shows a preview for valid images and blocks unsupported files", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const handleValidationErrorChange = vi.fn();

    await act(async () => {
      root.render(
        <TestFileUploadField
          onValidationErrorChange={handleValidationErrorChange}
        />,
      );
    });

    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]');

    if (!input) {
      throw new Error("Expected file input to render.");
    }

    await act(async () => {
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [
          new File(["html"], "confirmar-email.html", { type: "text/html" }),
        ],
      });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain(
      "El archivo debe ser JPG, PNG o WEBP.",
    );
    expect(container.textContent).toContain("Borrar imagen");
    expect(container.textContent).not.toContain("Reemplazar");
    expect(container.querySelector("img")).toBeNull();
    expect(
      container.querySelector<HTMLButtonElement>(
        'button[data-variant="destructive"][data-size="icon-sm"]',
      ),
    ).not.toBeNull();
    expect(handleValidationErrorChange).toHaveBeenLastCalledWith(true);

    await act(async () => {
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [new File(["image"], "documento.png", { type: "image/png" })],
      });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).not.toContain("documento.png");
    expect(container.textContent).not.toContain("JPG, PNG o WEBP - max 10 MB");
    expect(container.textContent).not.toContain("Reemplazar");
    expect(container.querySelector("img")?.getAttribute("alt")).toBe(
      "Vista previa de documento.png",
    );
    expect(handleValidationErrorChange).toHaveBeenLastCalledWith(false);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
