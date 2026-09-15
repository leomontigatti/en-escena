// PROTOTYPE ROUTE — throwaway, lives only on branch
// `prototype/913-program-pages`. Run `pnpm dev` and open `/prototipo/programa`
// to see the public program for wayfinder ticket #913 (map #907). No loader, no
// auth, no database: in-memory fixtures inside the first unauthenticated shell.
//
// The bar at the bottom writes:
//   `variante`: `A` (table + day tabs), `B` (sections per schedule, printable),
//     `C` (compact list); ← and → cycle it too
//   `caso`: `publicado`, `oculto` (`programVisible` off), `sin-evento`
//   `sesion`: `anonima`, `academia` (only the topbar action changes)
import { useEffect } from "react";
import { useSearchParams } from "react-router";

import {
  prototypeVariants,
  readPublicProgramRows,
  type PrototypeVariantId,
} from "@/features/public/program/prototype/program-fixtures.prototype";
import {
  NoPublishedProgram,
  ProgramVariant,
  PrototypeBar,
  PublicProgramHeader,
  PublicShell,
} from "@/features/public/program/prototype/program-views.prototype";

export const meta = () => [{ title: "Prototipo · Programa | En Escena" }];

const caseOptions = [
  { id: "publicado", label: "Programa publicado" },
  { id: "oculto", label: "Programa oculto" },
  { id: "sin-evento", label: "Sin evento activo" },
] as const;

const sessionOptions = [
  { id: "anonima", label: "Sin sesión" },
  { id: "academia", label: "Con sesión de academia" },
] as const;

export function readOption<TOption extends string>(
  value: string | null,
  options: readonly TOption[],
): TOption {
  return options.includes(value as TOption)
    ? (value as TOption)
    : (options[0] as TOption);
}

export function useVariantKeys(
  variant: PrototypeVariantId,
  setVariant: (variant: PrototypeVariantId) => void,
) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;

      if (
        target?.closest("input, textarea, [contenteditable], [role=tab]") ||
        (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
      ) {
        return;
      }

      const ids = prototypeVariants.map((option) => option.id);
      const step = event.key === "ArrowLeft" ? -1 : 1;
      const next = ids[(ids.indexOf(variant) + step + ids.length) % ids.length];

      if (next) {
        setVariant(next);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [variant, setVariant]);
}

export default function ProgramPrototypeRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const variant = readOption(
    searchParams.get("variante"),
    prototypeVariants.map((option) => option.id),
  );
  const caseId = readOption(
    searchParams.get("caso"),
    caseOptions.map((option) => option.id),
  );
  const session = readOption(
    searchParams.get("sesion"),
    sessionOptions.map((option) => option.id),
  );

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set(key, value);
    setSearchParams(params, { preventScrollReset: true, replace: true });
  };
  const setVariant = (next: PrototypeVariantId) => setParam("variante", next);

  useVariantKeys(variant, setVariant);

  return (
    <PublicShell session={session}>
      <div className="flex flex-col gap-6 pb-40">
        {caseId === "publicado" ? (
          <>
            <PublicProgramHeader />
            <ProgramVariant
              key={variant}
              variant={variant}
              rows={readPublicProgramRows()}
              showAcademy
            />
          </>
        ) : (
          // `oculto` and `sin-evento` read the same on purpose: the public
          // page does not say whether an event exists.
          <NoPublishedProgram />
        )}
      </div>

      <PrototypeBar
        variant={variant}
        onVariant={setVariant}
        rows={[
          {
            label: "Caso",
            options: caseOptions,
            current: caseId,
            onSelect: (id) => setParam("caso", id),
          },
          {
            label: "Sesión",
            options: sessionOptions,
            current: session,
            onSelect: (id) => setParam("sesion", id),
          },
        ]}
      />
    </PublicShell>
  );
}
