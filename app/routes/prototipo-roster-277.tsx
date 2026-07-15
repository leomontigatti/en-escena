/**
 * PROTOTYPE-ONLY route for issue #277 — throwaway. Renders the admin roster
 * editing surface (agregar / quitar inscripciones, eliminar coreografía) inside
 * the real admin shell, with a `?escenario=<key>` switch for edge states and a
 * `?variant=A|B|C` switch (floating bar) for the three UI approaches.
 *
 * Standalone (no admin auth gate) so it can be viewed without logging in, and
 * 404s in production so it never ships as a reachable unauthed page.
 *
 * URL: /prototipo-roster-277?escenario=senada&variant=A
 *
 * Delete this file and prototype-277.tsx once folded into the real view.
 */
import { useSearchParams } from "react-router";

import { AdminShell } from "@/components/admin/shell";
import {
  RosterEditPrototype,
  SCENARIOS,
  ScenarioControl,
  VariantSwitcher,
  VARIANTS,
  type VariantKey,
} from "@/features/admin/academies/account-current/choreography-detail/prototype-277";

export function loader() {
  if (import.meta.env.PROD) {
    throw new Response(null, { status: 404 });
  }
  return null;
}

export default function PrototipoRoster277Route() {
  const [searchParams, setSearchParams] = useSearchParams();

  const scenarioKey = searchParams.get("escenario") ?? SCENARIOS[0].key;
  const scenario = SCENARIOS.find((s) => s.key === scenarioKey) ?? SCENARIOS[0];

  const variantParam = searchParams.get("variant") ?? VARIANTS[0].key;
  const variant: VariantKey = (
    VARIANTS.some((v) => v.key === variantParam)
      ? variantParam
      : VARIANTS[0].key
  ) as VariantKey;

  function setParam(name: string, value: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(name, value);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }

  return (
    <AdminShell
      email="prototipo@enescena.dev"
      events={[]}
      selectedEventId={null}
      showEventSelector={false}
      breadcrumbItems={[
        { label: "Resumen", to: "/administracion/finanzas" },
        { label: scenario.choreographyName },
      ]}
    >
      <div className="flex flex-col gap-6 pb-24">
        <ScenarioControl
          scenarios={SCENARIOS}
          current={scenario.key}
          onChange={(key) => setParam("escenario", key)}
        />
        <RosterEditPrototype
          key={`${scenario.key}-${variant}`}
          scenario={scenario}
          variant={variant}
        />
      </div>
      {import.meta.env.PROD ? null : (
        <VariantSwitcher
          current={variant}
          onChange={(key) => setParam("variant", key)}
        />
      )}
    </AdminShell>
  );
}
