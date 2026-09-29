/** @vitest-environment jsdom */

import { afterEach, describe, expect, test } from "vitest";

import { DuplicateWarningPrompt } from "@/components/shared/duplicate-warning-prompt";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  findButton,
} from "@/lib/test-support/react-dom";

describe("DuplicateWarningPrompt", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
  });

  function renderPrompt(warning: object) {
    return renderer.renderAsync(
      <>
        <form id="ficha" />
        <DuplicateWarningPrompt
          formId="ficha"
          matchIds={["dancer-twin-1"]}
          title="¿Es la misma persona?"
          warning={warning}
        >
          Ya existe un bailarín con el mismo nombre.
        </DuplicateWarningPrompt>
      </>,
    );
  }

  test("asks again when a new save is warned after Cancelar", async () => {
    await renderPrompt({ matchIds: ["dancer-twin-1"] });
    expect(findButton("Continuar de todos modos")).toBeDefined();

    await clickReactDomButton("Cancelar");
    expect(findButton("Continuar de todos modos")).toBeUndefined();

    await renderPrompt({ matchIds: ["dancer-twin-1"] });
    expect(findButton("Continuar de todos modos")).toBeDefined();
  });
});
