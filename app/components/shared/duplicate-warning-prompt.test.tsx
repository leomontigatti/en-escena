/** @vitest-environment jsdom */

import { Check } from "lucide-react";
import { afterEach, describe, expect, test } from "vitest";

import { DuplicateWarningPrompt } from "@/components/shared/duplicate-warning-prompt";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  findButton,
  getButton,
} from "@/lib/test-support/react-dom";

describe("DuplicateWarningPrompt", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
  });

  function renderPrompt(warning: object, isPending = false) {
    return renderer.renderAsync(
      <>
        <form id="ficha" />
        <DuplicateWarningPrompt
          formId="ficha"
          isPending={isPending}
          matchIds={["dancer-twin-1"]}
          confirmIcon={Check}
          confirmLabel="Guardar"
          title="¿Guardar el bailarín?"
          warning={warning}
        >
          Ya existe un bailarín con el mismo nombre.
        </DuplicateWarningPrompt>
      </>,
    );
  }

  test("asks again when a new save is warned after Cancelar", async () => {
    await renderPrompt({ matchIds: ["dancer-twin-1"] });
    expect(findButton("Guardar")).toBeDefined();

    await clickReactDomButton("Cancelar");
    expect(findButton("Guardar")).toBeUndefined();

    await renderPrompt({ matchIds: ["dancer-twin-1"] });
    expect(findButton("Guardar")).toBeDefined();
  });

  test("turns both buttons off while the save it confirmed is in flight", async () => {
    await renderPrompt({ matchIds: ["dancer-twin-1"] }, true);

    expect(getButton("Guardar").disabled).toBe(true);
    expect(getButton("Cancelar").disabled).toBe(true);
  });
});
