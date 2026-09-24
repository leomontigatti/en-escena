/** @vitest-environment jsdom */

import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import {
  createReactDomTestRenderer,
  getButton,
} from "@/lib/test-support/react-dom";

import { AcademyNameWarningNotice } from "./academy-name-warning";

describe("AcademyNameWarningNotice", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
  });

  async function renderNotice() {
    await renderer.renderAsync(
      <MemoryRouter>
        <form>
          <AcademyNameWarningNotice
            matches={[
              {
                createdAt: new Date("2026-09-21T15:00:00.000Z"),
                id: "academia-existente",
                name: "Academia Existente",
              },
            ]}
          />
        </form>
      </MemoryRouter>,
    );
  }

  test("names the existing academy with its registration date and offers both accesses", async () => {
    await renderNotice();

    expect(document.body.textContent).toContain(
      "Ya existe una academia llamada «Academia Existente», registrada el 21/9/26.",
    );
    expect(document.body.textContent).toContain(
      "Si es la tuya, ingresá con esa cuenta o recuperá la contraseña. Si es otra academia con el mismo nombre, continuá.",
    );
    expect(
      Array.from(document.querySelectorAll("a")).map((link) =>
        link.getAttribute("href"),
      ),
    ).toEqual(["/ingresar", "/recuperar-acceso"]);
  });

  test("continues the same submission carrying the ids the person saw", async () => {
    await renderNotice();

    const form = document.querySelector("form");

    expect(form).not.toBeNull();
    expect(
      new FormData(form as HTMLFormElement).getAll("acknowledgedDuplicateIds"),
    ).toEqual(["academia-existente"]);
    expect(getButton("Continuar de todos modos").type).toBe("submit");
  });
});
