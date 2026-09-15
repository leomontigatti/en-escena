// PROTOTYPE ROUTE — throwaway, lives only on branch
// `prototype/913-program-pages`. Run `pnpm dev` and open
// `/prototipo/portal-presentaciones` to see the academy's presentations page for
// wayfinder ticket #913 (map #907), inside the real portal shell. No loader, no
// auth, no database.
//
// The bar at the bottom writes:
//   `variante`: `A`, `B`, `C` (the same layouts as `/prototipo/programa`)
//   `caso`: `publicado`, `oculto`, `sin-ordenar`, `sin-elegibles`, `sin-evento`
//   `avisos`: `si` adds a choreography below `Señada` (hidden) and a late one
//     without a number; `no` removes both
import { useSearchParams } from "react-router";

import { PortalShell } from "@/components/portal/ui";
import {
  portalCaseIds,
  portalCaseLabels,
  PortalPresentationsPrototype,
} from "@/features/portal/presentations/prototype/portal-presentations.prototype";
import {
  prototypeEvent,
  prototypeVariants,
  type PrototypeVariantId,
} from "@/features/public/program/prototype/program-fixtures.prototype";
import { PrototypeBar } from "@/features/public/program/prototype/program-views.prototype";

import { readOption, useVariantKeys } from "./prototipo.programa";

export const meta = () => [
  { title: "Prototipo · Presentaciones | Portal de academias | En Escena" },
];

const noticeOptions = [
  { id: "si", label: "Con oculta y sin número" },
  { id: "no", label: "Todas visibles" },
] as const;

export default function PortalPresentationsPrototypeRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const variant = readOption(
    searchParams.get("variante"),
    prototypeVariants.map((option) => option.id),
  );
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
  const setVariant = (next: PrototypeVariantId) => setParam("variante", next);

  useVariantKeys(variant, setVariant);

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
          variant={variant}
          withNotices={notices === "si"}
        />
      </div>

      <PrototypeBar
        variant={variant}
        onVariant={setVariant}
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
