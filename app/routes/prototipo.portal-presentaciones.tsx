// PROTOTYPE ROUTE — throwaway, lives only on branch
// `prototype/913-program-pages`. Run `pnpm dev` and open
// `/prototipo/portal-presentaciones` to see the academy's presentations page for
// wayfinder ticket #913 (map #907), inside the real portal shell. No loader, no
// auth, no database.
//
// The bar at the bottom switches:
//   `caso`: `publicado`, `oculto`, `sin-ordenar`, `sin-elegibles`, `sin-evento`
//   `avisos`: `si` adds a choreography below `Señada` (hidden from the program)
//     and a late one without a number; `no` removes both
import { useSearchParams } from "react-router";

import { PortalShell } from "@/components/portal/ui";
import {
  portalCaseIds,
  portalCaseLabels,
  PortalPresentationsPrototype,
} from "@/features/portal/presentations/prototype/portal-presentations.prototype";
import { prototypeEvent } from "@/features/public/program/prototype/program-fixtures.prototype";
import { PrototypeBar } from "@/features/public/program/prototype/program-views.prototype";

import { readOption } from "./prototipo.programa";

export const meta = () => [
  { title: "Prototipo · Presentaciones | Portal de academias | En Escena" },
];

const noticeOptions = [
  { id: "si", label: "Con oculta y sin número" },
  { id: "no", label: "Todas visibles" },
] as const;

export default function PortalPresentationsPrototypeRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const caseId = readOption(searchParams.get("caso"), portalCaseIds);
  const notices = readOption(
    searchParams.get("avisos"),
    noticeOptions.map((option) => option.id),
  );

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set(key, value);
    setSearchParams(params, { preventScrollReset: true, replace: true });
  };

  return (
    <PortalShell
      userEmail="contacto@danzarte.test"
      contactName="Lucía Paz"
      academyName="Estudio Danzarte"
      eventContext={{
        activeEvent:
          caseId === "sin-evento"
            ? null
            : {
                id: "evento-prototipo",
                name: prototypeEvent.name,
                active: true,
                registrationStartsAt: new Date("2026-06-01T00:00:00Z"),
                registrationEndsAt: new Date("2026-09-30T00:00:00Z"),
                startsAt: new Date(`${prototypeEvent.startsAt}T00:00:00Z`),
                endsAt: new Date(`${prototypeEvent.endsAt}T00:00:00Z`),
              },
      }}
      breadcrumbItems={[{ label: "Presentaciones" }]}
    >
      <div className="pb-40">
        <PortalPresentationsPrototype
          caseId={caseId}
          withNotices={notices === "si"}
        />
      </div>

      <PrototypeBar
        rows={[
          {
            label: "Caso",
            options: portalCaseIds.map((id) => ({
              id,
              label: portalCaseLabels[id],
            })),
            current: caseId,
            onSelect: (id) => setParam("caso", id),
          },
          {
            label: "Avisos",
            options: noticeOptions,
            current: notices,
            onSelect: (id) => setParam("avisos", id),
          },
        ]}
      />
    </PortalShell>
  );
}
