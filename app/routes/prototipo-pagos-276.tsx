/**
 * PROTOTYPE-ONLY route for issue #276 — throwaway. Renders the refined variant
 * A of the choreography financial detail (Pagar seña / Pagar saldo) inside the
 * real admin shell, with a `?escenario=<key>` switch to exercise edge states.
 *
 * Standalone (no admin auth gate) so it can be viewed without logging in, and
 * 404s in production so it never ships as a reachable unauthed page.
 *
 * URL: /prototipo-pagos-276?escenario=impaga
 *
 * Delete this file and prototype-276.tsx once folded into the real view.
 */
import { useSearchParams } from "react-router";

import { AdminShell } from "@/components/admin/shell";
import {
  ChoreographyFinanceDetailPrototype,
  SCENARIOS,
  ScenarioControl,
} from "@/features/admin/academies/account-current/choreography-detail/prototype-276";

export function loader() {
  if (import.meta.env.PROD) {
    throw new Response(null, { status: 404 });
  }
  return null;
}

export default function PrototipoPagos276Route() {
  const [searchParams, setSearchParams] = useSearchParams();
  const scenarioKey = searchParams.get("escenario") ?? SCENARIOS[0].key;
  const scenario = SCENARIOS.find((s) => s.key === scenarioKey) ?? SCENARIOS[0];

  function setScenario(key: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("escenario", key);
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
      <div className="flex flex-col gap-6 pb-20">
        <ScenarioControl
          scenarios={SCENARIOS}
          current={scenario.key}
          onChange={setScenario}
        />
        <ChoreographyFinanceDetailPrototype
          key={scenario.key}
          scenario={scenario}
        />
      </div>
    </AdminShell>
  );
}
