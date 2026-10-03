/** @vitest-environment jsdom */

import { act } from "react";
import { toast } from "sonner";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  openRadixSelect,
  selectRadixOption,
} from "@/lib/test-support/radix-select";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
} from "@/lib/test-support/react-dom";

import { MusicDownloadDialog } from "./music-download-dialog";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

const days = [
  { day: "2026-10-10", hasMusic: true },
  { day: "2026-10-11", hasMusic: false },
];

describe("the music download dialog", () => {
  const renderer = createReactDomTestRenderer();
  const openWindow = vi.spyOn(window, "open").mockReturnValue(null);
  const onOpenChange = vi.fn();

  afterEach(() => {
    renderer.cleanup();
    openWindow.mockClear();
    onOpenChange.mockClear();
    vi.mocked(toast.error).mockClear();
  });

  async function mount(defaultDay: string | null) {
    await renderer.renderAsync(
      <MusicDownloadDialog
        days={days}
        defaultDay={defaultDay}
        onOpenChange={onOpenChange}
        open
      />,
    );
  }

  // The form validates before it downloads, which settles after the click.
  async function submit() {
    await clickReactDomButton("Descargar");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  test("downloads the day the list is showing", async () => {
    await mount("2026-10-10");

    await submit();

    expect(openWindow).toHaveBeenCalledWith(
      "/administracion/presentaciones/audios?dia=2026-10-10",
      "_self",
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("downloads the day picked", async () => {
    await mount(null);

    await openRadixSelect(
      document.querySelector('[data-slot="select-trigger"]'),
    );
    await selectRadixOption("Sábado 10/10");
    await submit();

    expect(openWindow).toHaveBeenCalledWith(
      "/administracion/presentaciones/audios?dia=2026-10-10",
      "_self",
    );
  });

  test("asks for a day before downloading", async () => {
    await mount(null);

    await submit();

    expect(openWindow).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Elegí un día.");
  });

  test("turns down a day without any music", async () => {
    await mount("2026-10-11");

    await submit();

    expect(openWindow).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "Ningún audio cargado para ese día.",
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
