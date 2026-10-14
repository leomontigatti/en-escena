/** @vitest-environment jsdom */

import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { RosterSeminarInscriptionsTable } from "./roster-seminar-inscriptions-table";

describe("RosterSeminarInscriptionsTable", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
  });

  // The empty message is composed from the kind's noun since #1479; both
  // kinds pin the copy it replaced.
  test.each([
    ["dancer", "Este bailarín no tiene seminarios en el evento activo."],
    ["professor", "Este profesor no tiene seminarios en el evento activo."],
  ] as const)("says a %s holds no seminar", async (kind, message) => {
    await renderer.renderAsync(
      <MemoryRouter>
        <RosterSeminarInscriptionsTable inscriptions={[]} personKind={kind} />
      </MemoryRouter>,
    );

    expect(document.body.textContent).toContain(message);
  });
});
