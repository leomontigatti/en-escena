import { GraduationCap } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { HomeAccessCard } from "@/components/shared/home-access-card";

describe("HomeAccessCard", () => {
  test("uses the brand color for the icon background", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <HomeAccessCard
          item={{
            title: "Profesores",
            description: "Gestioná los profesores de tu academia.",
            icon: GraduationCap,
            to: "/portal/profesores",
          }}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("bg-brand");
    expect(markup).toContain("text-white");
  });
});
