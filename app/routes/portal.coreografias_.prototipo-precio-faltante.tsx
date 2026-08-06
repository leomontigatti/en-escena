/** THROWAWAY PROTOTYPE — ticket #623's route. Delete along with the prototype. */
import { PriceRefusalPrototypeView } from "@/features/portal/choreographies/price-refusal-prototype/view";
import type { PortalRouteHandle } from "@/components/portal/ui";

export const meta = () => [
  { title: "Prototipo de precio faltante | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [
    { label: "Coreografías", to: "/portal/coreografias" },
    { label: "Prototipo de precio faltante" },
  ],
} satisfies PortalRouteHandle;

export default function PriceRefusalPrototypeRoute() {
  return <PriceRefusalPrototypeView />;
}
