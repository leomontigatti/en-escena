import { RouterContextProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { action as academyOnboardingAction } from "@/routes/registro_.academia";

// The form is refused before the session is read or a row is written: an
// action that reached either would throw here, where no database is configured.
describe("academy onboarding validation", () => {
  test("refuses an academy without a city or a province", async () => {
    const result = await academyOnboardingAction(
      routeActionArgs(
        createOnboardingRequest({
          academyName: "Academia Sin Ciudad",
          city: "   ",
          contactName: "Contacto",
          phone: "1112345678",
          province: "",
        }),
      ),
    );

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        city: "Este campo es obligatorio.",
        province: "Este campo es obligatorio.",
      },
    });
  });

  test("refuses a name, a contact or a city made only of punctuation", async () => {
    const result = await academyOnboardingAction(
      routeActionArgs(
        createOnboardingRequest({
          academyName: ".",
          city: "-",
          contactName: "...",
          phone: "1112345678",
        }),
      ),
    );

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        academyName: "Ingresá al menos una letra o un número.",
        city: "Ingresá al menos una letra o un número.",
        contactName: "Ingresá al menos una letra o un número.",
      },
    });
  });

  test("refuses a province outside the list", async () => {
    const result = await academyOnboardingAction(
      routeActionArgs(
        createOnboardingRequest({
          academyName: "Academia Libre",
          contactName: "Contacto",
          phone: "1112345678",
          province: "Santa Fe",
        }),
      ),
    );

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: { province: "Elegí una provincia de la lista." },
    });
  });

  test("validates academy onboarding phone input", async () => {
    await expect(
      academyOnboardingAction(
        routeActionArgs(
          createOnboardingRequest({
            academyName: "Academia Telefono",
            contactName: "Contacto Telefono",
            phone: "11 1234-5678",
          }),
        ),
      ),
    ).resolves.toEqual({
      fieldErrors: {
        academyName: undefined,
        contactName: undefined,
        phone: "Ingresá 10 dígitos, sin espacios, 0 ni 15.",
        city: undefined,
        province: undefined,
      },
      message: "Revisá los datos del formulario.",
      status: "error",
      values: {
        academyName: "Academia Telefono",
        contactName: "Contacto Telefono",
        phone: "11 1234-5678",
        city: "Ciudad",
        province: "santa_fe",
      },
    });
  });
});

function createOnboardingRequest(input: {
  academyName: string;
  city?: string;
  contactName: string;
  phone: string;
  province?: string;
}) {
  return new Request("http://localhost/registro/academia", {
    body: new URLSearchParams({
      academyName: input.academyName,
      city: input.city ?? "Ciudad",
      contactName: input.contactName,
      phone: input.phone,
      province: input.province ?? "santa_fe",
    }),
    method: "POST",
  });
}

function routeActionArgs(request: Request) {
  return {
    context: new RouterContextProvider(),
    params: {},
    pattern: "/registro/academia",
    request,
    url: new URL(request.url),
  };
}
