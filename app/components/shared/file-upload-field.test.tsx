// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, test, vi } from "vitest";

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

type MusicFormValues = {
  musicStorageKey: string;
};

function TestMusicUploadField({
  defaultStorageKey = "",
  existingPreviewUrl,
}: {
  defaultStorageKey?: string;
  existingPreviewUrl?: string;
}) {
  // The music forms hand the same signed link to the download and the player.
  const form = useForm<MusicFormValues>({
    defaultValues: { musicStorageKey: defaultStorageKey },
  });

  return (
    <FileUploadField
      control={form.control}
      name="musicStorageKey"
      fileInputName="musicFile"
      fieldLabel="Archivo de música"
      label="Arrastrá o hacé click para cargar la música"
      {...getAssetUploadFieldProps("choreographyMusic")}
      downloadLabel="Descargar música"
      downloadUrl={existingPreviewUrl}
      existingPreviewUrl={existingPreviewUrl}
      previewKind="audio"
      removeLabel="Borrar música"
      // As the portal form does: a picked file replaces the stored one on save,
      // so the stored key goes back into the form alongside it.
      onSelectedFileChange={(file) => {
        if (file) {
          form.setValue("musicStorageKey", defaultStorageKey);
        }
      }}
    />
  );
}

// With a file in hand the player takes the picker's place, its actions at the
// end of the row. The picker stays in the form, hidden: a picked file is
// submitted through its input.
describe("FileUploadField with an audio preview", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  async function render(element: React.ReactNode) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(element);
    });
  }

  function getFileInput() {
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]');

    if (!input) {
      throw new Error("Expected the file input to stay in the form.");
    }

    return input;
  }

  function isPickerShown() {
    return getFileInput().closest("[hidden]") === null;
  }

  /** The labels of the player row's controls, in the order they sit. */
  function getPlayerControls() {
    const row = container.querySelector("audio")?.parentElement;

    return Array.from(
      row?.querySelectorAll("a, button, [role=slider]") ?? [],
    ).map(
      (control) =>
        control.getAttribute("aria-label") ?? control.textContent?.trim(),
    );
  }

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    Reflect.deleteProperty(URL, "createObjectURL");
  });

  test("plays the stored file in place of the picker", async () => {
    await render(
      <TestMusicUploadField
        defaultStorageKey="academies/a/music.mp3"
        existingPreviewUrl="/almacenamiento?key=music.mp3"
      />,
    );

    expect(container.querySelector("audio")?.getAttribute("src")).toBe(
      "/almacenamiento?key=music.mp3",
    );
    expect(isPickerShown()).toBe(false);
    expect(getPlayerControls()).toEqual([
      "Escuchar",
      "Posición",
      "Descargar música",
      "Borrar música",
    ]);
  });

  test("brings the picker back when the file is deleted from the player", async () => {
    await render(
      <TestMusicUploadField
        defaultStorageKey="academies/a/music.mp3"
        existingPreviewUrl="/almacenamiento?key=music.mp3"
      />,
    );

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Borrar música"]')
        ?.click();
    });

    expect(container.querySelector("audio")).toBeNull();
    expect(isPickerShown()).toBe(true);
    expect(
      container.querySelector<HTMLInputElement>('input[name="musicStorageKey"]')
        ?.value,
    ).toBe("");
  });

  test("plays a picked file in place of the picker, and still submits it", async () => {
    // jsdom has no `createObjectURL`; a browser hands back a `blob:` link.
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: () => "blob:tema",
    });
    await render(<TestMusicUploadField />);

    expect(container.querySelector("audio")).toBeNull();
    expect(isPickerShown()).toBe(true);

    const input = getFileInput();

    await act(async () => {
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [new File(["song"], "tema.mp3", { type: "audio/mpeg" })],
      });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.querySelector("audio")?.getAttribute("src")).toBe(
      "blob:tema",
    );
    expect(isPickerShown()).toBe(false);
    expect(getFileInput().files?.[0]?.name).toBe("tema.mp3");
    expect(getPlayerControls()).toEqual([
      "Escuchar",
      "Posición",
      "Borrar música",
    ]);
  });

  // The download is the stored file, so a picked one playing in its place has
  // nothing to offer there, even while the stored key waits in the form.
  test("offers no download while a picked file replaces the stored one", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: () => "blob:tema",
    });
    await render(
      <TestMusicUploadField
        defaultStorageKey="academies/a/music.mp3"
        existingPreviewUrl="/almacenamiento?key=music.mp3"
      />,
    );

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Borrar música"]')
        ?.click();
    });

    const input = getFileInput();

    await act(async () => {
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [new File(["song"], "tema.mp3", { type: "audio/mpeg" })],
      });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.querySelector("audio")?.getAttribute("src")).toBe(
      "blob:tema",
    );
    expect(getPlayerControls()).toEqual([
      "Escuchar",
      "Posición",
      "Borrar música",
    ]);
  });
});
