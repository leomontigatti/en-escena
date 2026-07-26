// PROTOTIPO — descartable. Ver issue #488.
//
// Tres variantes del detalle de academia sobre la ruta real, con datos reales
// y dentro del shell de admin. Se alternan con `?variant=A|B|C` o con la barra
// flotante de abajo (también con las flechas ← →).

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  PrototypeVariantSwitcher,
  usePrototypeVariant,
  type PrototypeVariant,
} from "@/components/shared/prototype-variant-switcher";
import { loadAcademyDetailPrototype } from "@/features/admin/academies/detail-prototype/server";
import {
  VariantA,
  variantAName,
} from "@/features/admin/academies/detail-prototype/variant-a";
import {
  VariantB,
  variantBName,
} from "@/features/admin/academies/detail-prototype/variant-b";
import {
  VariantC,
  variantCName,
} from "@/features/admin/academies/detail-prototype/variant-c";

import type { Route } from "./+types/administracion.academias_.$academyId";

type LoaderData = Awaited<ReturnType<typeof loader>>;

const variants: readonly PrototypeVariant[] = [
  { key: "A", name: variantAName },
  { key: "B", name: variantBName },
  { key: "C", name: variantCName },
];

export const meta: Route.MetaFunction = () => [
  { title: "Detalle de academia | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Academias", to: "/administracion/academias" },
    (match) => {
      const data = match.data as LoaderData | undefined;
      return data?.academy ? { label: data.academy.name } : null;
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request, params }: Route.LoaderArgs) {
  return await loadAcademyDetailPrototype({ request, params });
}

export default function AdministracionAcademiaDetalleRoute({
  loaderData,
}: {
  loaderData: LoaderData;
}) {
  const variant = usePrototypeVariant(variants);

  return (
    <>
      {variant === "A" ? <VariantA loaderData={loaderData} /> : null}
      {variant === "B" ? <VariantB loaderData={loaderData} /> : null}
      {variant === "C" ? <VariantC loaderData={loaderData} /> : null}
      <PrototypeVariantSwitcher current={variant} variants={variants} />
    </>
  );
}
