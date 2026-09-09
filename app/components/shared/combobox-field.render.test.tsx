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
