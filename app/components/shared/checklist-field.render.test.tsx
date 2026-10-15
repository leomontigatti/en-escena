/** @vitest-environment jsdom */

import { useForm } from "react-hook-form";
import { afterEach, describe, expect, test } from "vitest";

import { ChecklistField } from "./checklist-field";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  getReactDomTexts,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

const renderer = createReactDomTestRenderer();

afterEach(() => {
  renderer.cleanup();
});

let submittedDancerIds: string[] = [];

const dancers = [
  { value: "d1", label: "Abril Sosa" },
  { value: "d2", label: "Bea Lagos" },
  { value: "d3", label: "Camila Ríos" },
  { value: "d4", label: "Delfina Paz" },
  { value: "d5", label: "Emma Gil" },
  { value: "d6", label: "Flor Díaz" },
  { value: "d7", label: "Gala Ruiz" },
  { value: "d8", label: "Helena Vera" },
  { value: "d9", label: "Inés Mora" },
];

function DancersChecklist({
  error,
  inputName,
  options = dancers,
}: {
  error?: string;
  inputName?: string;
  options?: typeof dancers;
}) {
  const form = useForm({ defaultValues: { dancerIds: [] as string[] } });
  submittedDancerIds = form.watch("dancerIds");

  return (
    <ChecklistField
      control={form.control}
      emptySelectionMessage="Todavía no seleccionaste bailarines."
      error={error}
      inputName={inputName}
      label="Bailarines"
      name="dancerIds"
      options={options}
      searchLabel="Buscar bailarines"
    />
  );
}

function getRowNames() {
  return getReactDomTexts('[data-slot="choice-card"]');
}

function getSearchInput() {
  return document.querySelector<HTMLInputElement>(
    'input[aria-label="Buscar bailarines"]',
  ) as HTMLInputElement;
}

async function clickRow(name: string) {
  const row = Array.from(
    document.querySelectorAll<HTMLElement>('[data-slot="choice-card"]'),
  ).find((candidate) => candidate.textContent === name);

  await updateReactDomForm(() => {
    row?.click();
  });
}

/** Radix tabs switch on mouse down, not on click. */
async function pickTab(name: string) {
  const tab = Array.from(
    document.querySelectorAll<HTMLElement>('[role="tab"]'),
  ).find((candidate) => candidate.textContent?.startsWith(name));

  await updateReactDomForm(() => {
    tab?.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 }),
    );
  });
}

describe("ChecklistField", () => {
  test("marks every row invalid under an error the form does not own", async () => {
    await renderer.renderAsync(
      <DancersChecklist error="Con este elenco cambia el tipo de grupo." />,
    );

    const checkboxes = document.querySelectorAll('[role="checkbox"]');
    expect(checkboxes).toHaveLength(dancers.length);
    for (const checkbox of checkboxes) {
      expect(checkbox.getAttribute("aria-invalid")).toBe("true");
    }
    expect(document.body.textContent).toContain(
      "Con este elenco cambia el tipo de grupo.",
    );
  });

  test("checks and unchecks a person by tapping anywhere on the row", async () => {
    await renderer.renderAsync(<DancersChecklist />);

    await clickRow("Bea Lagos");
    expect(submittedDancerIds).toEqual(["d2"]);

    await clickRow("Abril Sosa");
    expect(submittedDancerIds).toEqual(["d2", "d1"]);

    await clickRow("Bea Lagos");
    expect(submittedDancerIds).toEqual(["d1"]);
  });

  test("searches ignoring accents and case, and clearing brings everyone back", async () => {
    await renderer.renderAsync(<DancersChecklist />);

    await updateReactDomForm(() => {
      setInputValue(getSearchInput(), "RIOS");
    });
    expect(getRowNames()).toEqual(["Camila Ríos"]);

    await updateReactDomForm(() => {
      setInputValue(getSearchInput(), "zz");
    });
    expect(document.body.textContent).toContain("Sin resultados.");

    await clickReactDomButton("Limpiar búsqueda");
    expect(getRowNames()).toEqual(dancers.map((dancer) => dancer.label));
  });

  // Eight rows fit the list's height even in one column, so there is nothing
  // to search for and every checked row is already in sight.
  test("drops the search and the tabs while every option fits without scrolling", async () => {
    await renderer.renderAsync(
      <DancersChecklist options={dancers.slice(0, 8)} />,
    );

    expect(getSearchInput()).toBeNull();
    expect(document.querySelectorAll('[role="tab"]')).toHaveLength(0);
    expect(getRowNames()).toHaveLength(8);

    await clickRow("Helena Vera");
    expect(submittedDancerIds).toEqual(["d8"]);
  });

  // Grown back, a list that lost its search must not come back filtered by a
  // query its user can no longer remember typing.
  test("starts over when the list shrinks below the search and grows back", async () => {
    await renderer.renderAsync(<DancersChecklist />);
    await updateReactDomForm(() => {
      setInputValue(getSearchInput(), "Inés");
    });
    await pickTab("Seleccionados");

    await renderer.renderAsync(
      <DancersChecklist options={dancers.slice(0, 8)} />,
    );
    await renderer.renderAsync(<DancersChecklist />);

    expect(getSearchInput().value).toBe("");
    expect(getRowNames()).toEqual(dancers.map((dancer) => dancer.label));
  });

  // "Sin resultados." would blame a search nobody typed.
  test("says there is nothing to pick when the list has no options", async () => {
    await renderer.renderAsync(<DancersChecklist options={[]} />);

    expect(document.body.textContent).toContain("Sin opciones.");
    expect(document.body.textContent).not.toContain("Sin resultados.");
  });

  // A form that posts its own fields, rather than the values React Hook Form
  // validated, reads the checked options from the DOM.
  test("posts each checked option under `inputName`", async () => {
    await renderer.renderAsync(<DancersChecklist inputName="dancerIds" />);

    await clickRow("Bea Lagos");
    await clickRow("Inés Mora");

    expect(
      Array.from(
        document.querySelectorAll<HTMLInputElement>(
          'input[type="hidden"][name="dancerIds"]',
        ),
        (input) => input.value,
      ),
    ).toEqual(["d2", "d9"]);
  });

  test("shows only the checked options under `Seleccionados`, counting them", async () => {
    await renderer.renderAsync(<DancersChecklist />);

    await pickTab("Seleccionados");
    expect(getRowNames()).toEqual([]);
    expect(document.body.textContent).toContain(
      "Todavía no seleccionaste bailarines.",
    );

    await pickTab("Todos");
    await clickRow("Camila Ríos");
    await pickTab("Seleccionados");

    // The count sits in a badge; the hidden comma keeps a screen reader from
    // reading the tab as "Seleccionados1".
    expect(getReactDomTexts('[role="tab"]')).toEqual([
      "Todos",
      "Seleccionados, 1",
    ]);
    expect(getRowNames()).toEqual(["Camila Ríos"]);
  });
});
