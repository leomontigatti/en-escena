/**
 * PROTOTYPE-ONLY route for issue #277 — throwaway. Renders the admin
 * choreography detail/form with the ROSTER unlocked (bailarines + profesores),
 * live re-resolution of tipo de grupo/categoría (locked, con candado), nivel y
 * cronograma habilitados solo cuando el recálculo lo exige, presentation
 * hard-lock, and a light save confirmation.
 *
 * Standalone (no admin auth gate) so it can be viewed without logging in, and
 * 404s in production so it never ships as a reachable unauthed page.
 *
 * URL: /prototipo-roster-form-277?escenario=firmada
 *
 * Delete this file and prototype-277-form.tsx once folded into the real view.
 */
import { useSearchParams } from "react-router";

import { AdminShell } from "@/components/admin/shell";
import {
  RosterFormPrototype,
  SCENARIOS,
  ScenarioControl,
} from "@/features/admin/choreographies/detail/prototype-277-form";

export function loader() {
  if (import.meta.env.PROD) {
    throw new Response(null, { status: 404 });
  }
  return null;
}

export default function PrototipoRosterForm277Route() {
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
        { label: "Coreografías", to: "/administracion/coreografias" },
        { label: scenario.choreographyName },
      ]}
    >
      <div className="flex flex-col gap-6 pb-16">
        <ScenarioControl
          scenarios={SCENARIOS}
          current={scenario.key}
          onChange={setScenario}
        />
        <RosterFormPrototype key={scenario.key} scenario={scenario} />
      </div>
    </AdminShell>
  );
}
