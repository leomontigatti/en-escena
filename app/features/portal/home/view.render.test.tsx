import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import type { PortalHomeLoaderData } from "./server";
import { PortalHomeRouteView } from "./view";

const invitationTitle = "Participá de la Gran final de En Escena 2026";
const eligibleTitle = "Tu academia cumple los requisitos de la Gran final";

describe("the portal home's `Gran final` alerts", () => {
  test("invites an academy that is not eligible while some schedule takes inscriptions, with one bullet per requirement", () => {
    const markup = renderHome({
      grandFinal: {
        eventName: "En Escena 2026",
        isEligible: false,
        isRegistrationOpen: true,
      },
    });

    expect(markup).toContain(invitationTitle);
    expect(bullets(markup)).toEqual([
      "Al menos una coreografía grupal en una categoría Baby o Infantil.",
      "Al menos una coreografía grupal en una categoría Juvenil, Mayores o Adultos.",
      "Las dos en la misma modalidad.",
    ]);
    expect(markup).not.toContain(eligibleTitle);
  });

  test("an eligible academy reads that it meets the requirements instead of the invitation", () => {
    const markup = renderHome({
      grandFinal: {
        eventName: "En Escena 2026",
        isEligible: true,
        isRegistrationOpen: true,
      },
    });

    expect(markup).toContain(eligibleTitle);
    expect(markup).not.toContain(invitationTitle);
  });

  // Inscriptions gate the invitation only: closing them takes away the chance
  // to qualify, not the fact of having qualified.
  test("an eligible academy keeps its alert after inscriptions close", () => {
    const markup = renderHome({
      grandFinal: {
        eventName: "En Escena 2026",
        isEligible: true,
        isRegistrationOpen: false,
      },
    });

    expect(markup).toContain(eligibleTitle);
  });

  test("shows no alert to an academy that is not eligible once no schedule takes inscriptions", () => {
    const markup = renderHome({
      grandFinal: {
        eventName: "En Escena 2026",
        isEligible: false,
        isRegistrationOpen: false,
      },
    });

    expect(markup).not.toContain("Gran final");
  });

  test("shows no alert without an active event", () => {
    expect(renderHome({ grandFinal: null })).not.toContain("Gran final");
  });
});

function renderHome(loaderData: PortalHomeLoaderData) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <PortalHomeRouteView loaderData={loaderData} />
    </MemoryRouter>,
  );
}

function bullets(markup: string) {
  return [...markup.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((match) => match[1]);
}
