/** @vitest-environment jsdom */

import { act } from "react";
import { toast } from "sonner";
import {
  createMemoryRouter,
  RouterProvider,
  useActionData,
} from "react-router";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  onTestFinished,
  test,
  vi,
} from "vitest";

import {
  createReactDomTestRenderer,
  findButton,
  updateReactDomForm,
  waitFor,
} from "@/lib/test-support/react-dom";

import type {
  AcademyGrandFinalActionData,
  AcademyGrandFinalLoaderData,
} from "./shared";
import { AcademyGrandFinalView } from "./view";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

/** Vecina, a finalist through Ana in Jazz, where Bruno picked Pirueta. */
const loaderData: AcademyGrandFinalLoaderData = {
  academyId: "vecina",
  academyName: "Academia Vecina",
  bannerUrls: {
    first: "/almacenamiento?key=1",
    second: "/almacenamiento?key=2",
  },
  eligible: true,
  finalist: true,
  judges: [
    { id: "ana", name: "Ana Juez" },
    { id: "bruno", name: "Bruno Juez" },
  ],
  modalityId: "jazz",
  modalityName: "Jazz",
  otherPicks: { bruno: "Academia Pirueta" },
  selectedEventId: "evento",
  values: {
    firstBannerStorageKey: "events/evento/grand-final/vecina/first-1.png",
    judgeIds: ["ana"],
    secondBannerStorageKey: "events/evento/grand-final/vecina/second-1.png",
  },
};

/** The view as the route renders it, with the action's latest answer. */
function RoutedView({
  data = loaderData,
}: {
  data?: AcademyGrandFinalLoaderData;
}) {
  const actionData = useActionData<AcademyGrandFinalActionData>();

  return <AcademyGrandFinalView actionData={actionData} loaderData={data} />;
}

describe("the finalist banner form", () => {
  const renderer = createReactDomTestRenderer();
  const submitted: FormData[] = [];

  beforeEach(() => {
    submitted.length = 0;
  });

  afterEach(renderer.cleanup);

  async function mount(
    answer: AcademyGrandFinalActionData = {
      message: "Guardaste los cambios.",
      status: "success",
    },
    data: AcademyGrandFinalLoaderData = loaderData,
  ) {
    const path = "/administracion/gran-final/vecina/jazz";
    const router = createMemoryRouter(
      [
        {
          path,
          action: async ({ request }): Promise<AcademyGrandFinalActionData> => {
            submitted.push(await request.formData());

            return answer;
          },
          element: <RoutedView data={data} />,
        },
      ],
      { initialEntries: [path] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  const saveButton = () => findButton("Guardar", { exact: true });
  const judgeRow = (name: string) =>
    [
      ...document.querySelectorAll<HTMLElement>('[data-slot="choice-card"]'),
    ].find((row) => row.textContent === name);

  test("posts the judges, none included, with the marker that says the field was sent", async () => {
    await mount();

    await updateReactDomForm(() => {
      judgeRow("Ana Juez")?.click();
    });
    await updateReactDomForm(() => {
      saveButton()?.click();
    });
    await waitFor(() => submitted.length === 1);

    expect(submitted[0].get("judgeIdsPosted")).toBe("1");
    expect(submitted[0].getAll("judgeIds")).toEqual([]);
  });

  test("asks before moving a judge's pick off another academy, naming it", async () => {
    await mount();

    await updateReactDomForm(() => {
      judgeRow("Bruno Juez")?.click();
    });
    await updateReactDomForm(() => {
      saveButton()?.click();
    });

    expect(
      document.querySelector('[role="alertdialog"]')?.textContent,
    ).toContain("Bruno Juez deja de elegir a Academia Pirueta");
    expect(submitted).toHaveLength(0);

    await updateReactDomForm(() => {
      findButton("Guardar", {
        exact: true,
        within: document.querySelector('[role="alertdialog"]'),
      })?.click();
    });
    await waitFor(() => submitted.length === 1);

    expect(submitted[0].getAll("judgeIds")).toEqual(["ana", "bruno"]);
  });

  test("offers only the judges to take away where the academy stopped qualifying", async () => {
    await mount(undefined, {
      ...loaderData,
      eligible: false,
    });

    await updateReactDomForm(() => {
      document
        .querySelector<HTMLElement>('[data-slot="combobox-trigger"]')
        ?.click();
    });

    expect(
      [...document.querySelectorAll('[role="option"]')].map(
        (option) => option.textContent,
      ),
    ).not.toContain("Bruno Juez");
  });

  test("removes one banner and keeps the other's stored key", async () => {
    await mount();

    const [removeFirst] = document.querySelectorAll<HTMLButtonElement>(
      'button[data-variant="destructive"]',
    );
    await updateReactDomForm(() => {
      removeFirst.click();
    });

    expect(saveButton()?.disabled).toBe(false);

    await updateReactDomForm(() => {
      saveButton()?.click();
    });
    await waitFor(() => submitted.length === 1);

    expect(submitted[0].get("intent")).toBe("save-academy-grand-final");
    expect(submitted[0].get("firstBannerStorageKey")).toBe("");
    expect(submitted[0].get("secondBannerStorageKey")).toBe(
      loaderData.values.secondBannerStorageKey,
    );
  });

  // jsdom decodes no image and draws on no canvas: these stand in for the
  // browser so the editor can open a photo and hand back its JPEG.
  function stubBrowserImaging() {
    vi.stubGlobal(
      "Image",
      class {
        height = 4000;
        onload: (() => void) | null = null;
        width = 3000;
        set src(_url: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    vi.stubGlobal(
      "DataTransfer",
      class {
        private picked: File[] = [];
        items = { add: (file: File) => this.picked.push(file) };
        get files() {
          return this.picked;
        }
      },
    );
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: () => "blob:foto",
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: () => {},
    });
    const context = new Proxy({}, { get: () => () => {} });
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(context as never);
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((done) =>
        done(new Blob(["jpg"], { type: "image/jpeg" })),
      );
    onTestFinished(() => {
      vi.unstubAllGlobals();
      getContext.mockRestore();
      toBlob.mockRestore();
      Reflect.deleteProperty(URL, "createObjectURL");
      Reflect.deleteProperty(URL, "revokeObjectURL");
    });
  }

  test("frames a picked picture in the editor and keeps the JPEG it makes, as a change", async () => {
    stubBrowserImaging();
    await mount();
    const input = document.querySelector<HTMLInputElement>(
      'input[name="secondBanner"]',
    );

    if (!input) {
      throw new Error("Expected the second banner's file input");
    }

    await act(async () => {
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [new File(["png"], "retrato.png", { type: "image/png" })],
        writable: true,
      });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitFor(
      () => findButton("Usar foto", { exact: true })?.disabled === false,
    );

    expect(document.body.textContent).toContain("Encuadrá la foto");
    expect(saveButton()?.disabled).toBe(true);

    await updateReactDomForm(() => {
      findButton("Usar foto", { exact: true })?.click();
    });
    await waitFor(() => input.files?.[0]?.name === "retrato.jpg");

    expect(input.files?.[0]?.type).toBe("image/jpeg");
    expect(saveButton()?.disabled).toBe(false);
  });

  test("tells the user why the server refused a picture", async () => {
    const refusal =
      "El Banner 2 tiene que ser horizontal 16:9, como 1920 × 1080; el elegido mide 1600 × 1600.";
    await mount({ message: refusal, status: "error" });

    const [removeFirst] = document.querySelectorAll<HTMLButtonElement>(
      'button[data-variant="destructive"]',
    );
    await updateReactDomForm(() => {
      removeFirst.click();
    });
    await updateReactDomForm(() => {
      saveButton()?.click();
    });

    await waitFor(() => vi.mocked(toast.error).mock.calls.length > 0);
    expect(vi.mocked(toast.error).mock.calls[0][0]).toBe(refusal);
    expect(saveButton()?.disabled).toBe(false);
  });
});
