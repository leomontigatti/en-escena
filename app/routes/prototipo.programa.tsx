// PROTOTYPE ROUTE — throwaway, lives only on branch
// `prototype/913-program-pages`. Run `pnpm dev` and open `/prototipo/programa`
// to see the public program for wayfinder ticket #913 (map #907). No loader, no
// auth, no database: in-memory fixtures inside the first unauthenticated shell.
//
// The first review kept one layout, aligned with the admin list of #912. The bar
// at the bottom switches the case:
//   `caso`: `publicado`, `oculto` (`programVisible` off), `sin-evento`
//   `sesion`: `anonima`, `academia` (only the topbar action changes)
import { useSearchParams } from "react-router";

import { readPublicProgramRows } from "@/features/public/program/prototype/program-fixtures.prototype";
import {
  NoPublishedProgram,
  PrintableProgram,
  ProgramList,
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

export default function ProgramPrototypeRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
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

  return (
    <PublicShell session={session}>
      <div className="flex flex-col gap-6 pb-40 print:pb-0">
        {caseId === "publicado" ? (
          <>
            <div className="flex flex-col gap-6 print:hidden">
              <PublicProgramHeader />
              <ProgramList rows={readPublicProgramRows()} showAcademy />
            </div>
            <PrintableProgram rows={readPublicProgramRows()} />
          </>
        ) : (
          // `oculto` and `sin-evento` read the same on purpose: the public page
          // does not say whether an event exists.
          <NoPublishedProgram />
        )}
      </div>

      <PrototypeBar
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
