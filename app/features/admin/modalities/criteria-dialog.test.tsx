/** @vitest-environment jsdom */

import {
  createMemoryRouter,
  RouterProvider,
  useLoaderData,
} from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { SubmodalityCriteriaDialog } from "@/features/admin/modalities/criteria-dialog";
import type {
  EventSubmodalityCriterionRow,
  EventSubmodalityRow,
} from "@/features/admin/modalities/shared";
import type { ExperienceLevel } from "@/lib/events/experience-levels";
import type { OfferedSheets } from "@/lib/judging/sheet-criteria";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  findButton,
  getButton,
  setInputValue,
  updateReactDomForm,
  waitFor,
} from "@/lib/test-support/react-dom";

const submodality: EventSubmodalityRow = {
  id: "submodality_1",
  eventId: "event_1",
  modalityId: "modality_1",
  name: "Acrobacia",
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

const sheets: OfferedSheets = {
  generalStandsAlone: false,
  levels: ["amateur", "profesional"],
};

describe("the submodality criteria editor", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("lists each sheet with its total, and warns about the ones short of 100", async () => {
    await mount([
      criterion("Técnica", 60),
      criterion("Figuras", 40, { experienceLevel: "amateur" }),
    ]);

    expect(sheetRows()).toEqual([
      "Evaluación general · 1 criterio · 60/100",
      "Amateur · 1 criterio · 100/100",
      "Profesional · 0 criterios · 60/100",
    ]);
    expect(document.body.textContent).toContain("Planillas incompletas");
  });

  test("saves a level's own criteria, with the kind each one was added under", async () => {
    const { posted } = await mount([criterion("Técnica", 60)]);

    await clickReactDomButton("Profesional");
    await addCriterion("Agregar criterio que suma", "Dificultad", "40");
    await addCriterion("Agregar criterio que descuenta", "Caída", "5");

    expect(counter()).toBe("60 + 40 / 100");

    await clickReactDomButton("Guardar");
    await waitFor(() => posted.length === 1);

    expect(Object.fromEntries(posted[0])).toMatchObject({
      "criteria.0.kind": "adds",
      "criteria.0.maximum": "40",
      "criteria.0.name": "Dificultad",
      "criteria.1.kind": "deducts",
      "criteria.1.maximum": "5",
      "criteria.1.name": "Caída",
      experienceLevel: "profesional",
      id: submodality.id,
      intent: "save-submodality-criteria",
    });
    // The save landed, so the editor is back on the list of sheets.
    await waitFor(() => findButton("Volver") === undefined);
    expect(sheetRows()[2]).toBe("Profesional · 2 criterios · 100/100");
  });

  test("refuses a level sheet short of 100 on `Guardar`, without posting, until it adds up", async () => {
    const { posted } = await mount([criterion("Técnica", 60)]);

    await clickReactDomButton("Amateur");
    await addCriterion("Agregar criterio que suma", "Figuras", "30");

    expect(document.body.textContent).not.toContain("debe ser igual a 100");

    await updateReactDomForm(() => {
      getButton("Guardar").click();
    });

    await waitFor(() =>
      document.body.textContent!.includes(
        "El total de los criterios que suman debe ser igual a 100.",
      ),
    );
    // The post would have landed by now; give it the time to.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(posted).toEqual([]);

    // From then on the message follows what is typed.
    await updateReactDomForm(() => {
      setInputValue(
        document.querySelector<HTMLInputElement>("#criterion-maximum-0")!,
        "40",
      );
    });

    expect(document.body.textContent).not.toContain("debe ser igual a 100");
  });

  // Regression: the dialog is portalled out of the modality form but sits inside
  // it in React's tree, and its submit bubbled to that form's handler, which
  // posted the sheet again without its validation.
  test("keeps its submit from the page's form around it", async () => {
    const outerSubmits: string[] = [];

    await mount([criterion("Técnica", 60)], {
      onOuterSubmit: () => outerSubmits.push("outer"),
    });
    await clickReactDomButton("Amateur");
    await addCriterion("Agregar criterio que suma", "Figuras", "30");
    await updateReactDomForm(() => {
      getButton("Guardar").click();
    });

    expect(outerSubmits).toEqual([]);
  });

  test("asks before `Volver` drops a typed sheet", async () => {
    await mount([criterion("Técnica", 60)]);

    await clickReactDomButton("Amateur");
    await addCriterion("Agregar criterio que suma", "Figuras", "40");
    await clickReactDomButton("Volver");

    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  });

  test("shows a scored submodality's sheets read-only", async () => {
    await mount([criterion("Técnica", 100)], { locked: true });

    await clickReactDomButton("Evaluación general");

    expect(findButton("Guardar")).toBeUndefined();
    expect(findButton("Agregar criterio que suma")).toBeUndefined();
    expect(
      document.querySelector<HTMLInputElement>("#criterion-name-0")?.disabled,
    ).toBe(true);
  });

  async function mount(
    initial: EventSubmodalityCriterionRow[],
    options: { locked?: boolean; onOuterSubmit?: () => void } = {},
  ) {
    let stored = initial;
    const posted: FormData[] = [];

    function Page() {
      const criteria = useLoaderData() as EventSubmodalityCriterionRow[];

      return (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            options.onOuterSubmit?.();
          }}
        >
          <SubmodalityCriteriaDialog
            criteria={criteria}
            locked={options.locked ?? false}
            modalityId="modality_1"
            onOpenChange={() => {}}
            open
            sheets={sheets}
            submodality={submodality}
          />
        </form>
      );
    }

    const router = createMemoryRouter(
      [
        {
          path: "/",
          action: async ({ request }) => {
            const formData = await request.formData();
            const level = String(formData.get("experienceLevel")) || null;

            posted.push(formData);
            stored = [
              ...stored.filter(
                (criterion) => criterion.experienceLevel !== level,
              ),
              ...readPostedCriteria(formData, level as ExperienceLevel | null),
            ];

            return null;
          },
          element: <Page />,
          loader: () => stored,
        },
      ],
      { initialEntries: ["/"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);

    return { posted };
  }
});

function criterion(
  name: string,
  maximum: number,
  overrides: Partial<EventSubmodalityCriterionRow> = {},
): EventSubmodalityCriterionRow {
  return {
    eventId: "event_1",
    experienceLevel: null,
    id: `criterion-${name}`,
    kind: "adds",
    maximum,
    name,
    position: 0,
    submodalityId: submodality.id,
    ...overrides,
  };
}

function readPostedCriteria(
  formData: FormData,
  experienceLevel: ExperienceLevel | null,
): EventSubmodalityCriterionRow[] {
  const rows: EventSubmodalityCriterionRow[] = [];

  for (let index = 0; formData.has(`criteria.${index}.name`); index += 1) {
    rows.push(
      criterion(String(formData.get(`criteria.${index}.name`)), 0, {
        experienceLevel,
        kind: formData.get(`criteria.${index}.kind`) as "adds" | "deducts",
        maximum: Number(formData.get(`criteria.${index}.maximum`)),
      }),
    );
  }

  return rows;
}

async function addCriterion(button: string, name: string, maximum: string) {
  await clickReactDomButton(button);

  const index = document.querySelectorAll("[id^='criterion-name-']").length - 1;

  await updateReactDomForm(() => {
    setInputValue(
      document.querySelector<HTMLInputElement>(`#criterion-name-${index}`)!,
      name,
    );
    setInputValue(
      document.querySelector<HTMLInputElement>(`#criterion-maximum-${index}`)!,
      maximum,
    );
  });
}

/** Each sheet row as "title · count · total". */
function sheetRows() {
  return [...document.querySelectorAll("[data-sheet-row]")].map((row) =>
    [...row.querySelectorAll("[data-sheet-row-part]")]
      .map((part) => part.textContent)
      .join(" · "),
  );
}

function counter() {
  return document.querySelector("[role='status']")?.textContent;
}
