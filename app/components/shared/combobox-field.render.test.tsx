/** @vitest-environment jsdom */

// Pins the fix that made `ComboboxField` usable inside a dialog: its popup has
// to render into the host `DialogContent` provides, not into `document.body`.
// From the body it counts as an outside press, so picking an option dismisses
// the dialog and the search input never receives pointer events.

import { useForm } from "react-hook-form";
import { afterEach, describe, expect, test } from "vitest";

import { ComboboxField } from "./combobox-field";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

const renderer = createReactDomTestRenderer();

afterEach(() => {
  renderer.cleanup();
});

function ComboboxInDialog() {
  const form = useForm<{ personId: string }>({
    defaultValues: { personId: "" },
  });

  return (
    <Dialog open>
      <DialogContent>
        <DialogTitle>Marina Zabala</DialogTitle>
        <ComboboxField
          control={form.control}
          id="person-id"
          label="Persona"
          name="personId"
          options={[
            { value: "d1", label: "Abril Sosa" },
            { value: "p1", label: "Fernanda Ledesma" },
          ]}
          placeholder="Elegí una persona del plantel"
        />
      </DialogContent>
    </Dialog>
  );
}

function GroupedCombobox() {
  const form = useForm<{ person: string }>({
    defaultValues: { person: "" },
  });

  return (
    <ComboboxField
      control={form.control}
      inputPlaceholder="Buscar por nombre"
      label="Persona"
      name="person"
      groups={[
        {
          label: "Bailarines",
          options: [
            { value: "dancer:1", label: "Abril Sosa" },
            { value: "dancer:2", label: "Ezequiel Ipsale" },
          ],
        },
        {
          label: "Profesores",
          options: [{ value: "professor:1", label: "Fernanda Ledesma" }],
        },
      ]}
      placeholder="Elegí una persona del plantel"
    />
  );
}

function getComboboxTexts(selector: string) {
  return Array.from(document.querySelectorAll(selector)).map(
    (element) => element.textContent,
  );
}

describe("ComboboxField inside a dialog", () => {
  test("renders its popup into the dialog's portal host", async () => {
    await renderer.renderAsync(<ComboboxInDialog />);

    await clickReactDomButton("Elegí una persona del plantel");

    const portalHost = document.querySelector(
      '[data-slot="dialog-combobox-portal-host"]',
    );

    expect(portalHost).not.toBeNull();
    expect(
      portalHost?.querySelector('[data-slot="combobox-content"]'),
    ).not.toBeNull();
  });
});

// The seminar picker mixes dancers and professors, and a single alphabetical
// order interleaves them into a list the reader has to parse person by person.
describe("ComboboxField with grouped options", () => {
  test("titles each section without offering the title as an option", async () => {
    await renderer.renderAsync(<GroupedCombobox />);

    await clickReactDomButton("Elegí una persona del plantel");

    expect(getComboboxTexts('[data-slot="combobox-label"]')).toEqual([
      "Bailarines",
      "Profesores",
    ]);
    expect(getComboboxTexts('[role="option"]')).toEqual([
      "Abril Sosa",
      "Ezequiel Ipsale",
      "Fernanda Ledesma",
    ]);
  });

  test("drops the heading of a section the search leaves empty", async () => {
    await renderer.renderAsync(<GroupedCombobox />);

    await clickReactDomButton("Elegí una persona del plantel");

    const input = document.querySelector<HTMLInputElement>(
      'input[placeholder="Buscar por nombre"]',
    );

    expect(input).not.toBeNull();

    await updateReactDomForm(() => {
      setInputValue(input as HTMLInputElement, "Fernanda");
    });

    expect(getComboboxTexts('[data-slot="combobox-label"]')).toEqual([
      "Profesores",
    ]);
    expect(getComboboxTexts('[role="option"]')).toEqual(["Fernanda Ledesma"]);
  });
});
