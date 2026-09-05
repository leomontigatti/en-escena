import { useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

import { ChipBarPrototype } from "./chip-bar-prototype";
import { CommandPrototype } from "./command-prototype";
import { SheetPrototype } from "./sheet-prototype";
import {
  buildFilterSearch,
  createEmptyFilterValues,
  getAppliedFilters,
  type FilterValues,
} from "./filter-schema";
import {
  choreographyFilterFields,
  totalFilterOptionCount,
} from "./sample-facets";

/**
 * Throwaway comparison page for the three filter panel prototypes. Each one owns
 * its own state so they can be driven independently, and each prints the
 * canonical search string its state would produce, which is the contract the
 * loader would read back.
 */

export function FilterPanelPrototypesView() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Prototipos de filtros</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Tres formas de resolver el panel de filtros del listado de
          coreografías, con las mismas cinco facetas —{" "}
          {choreographyFilterFields.length} campos y {totalFilterOptionCount}{" "}
          opciones en total, que es lo que hoy se apila en un solo desplegable.
        </p>
      </header>
      <PrototypeSection
        title="A · Barra de chips"
        description="Un chip por campo. Se abre solo el campo elegido, así que la altura la define la faceta más larga y no la suma de todas."
      >
        {(values, onValuesChange) => (
          <ChipBarPrototype
            fields={choreographyFilterFields}
            values={values}
            onValuesChange={onValuesChange}
          />
        )}
      </PrototypeSection>
      <PrototypeSection
        title="B · Añadir filtro"
        description="Un único acceso sobre una lista buscable de todos los pares campo/opción. Escribir «mayo» llega al día y «jazz» a la modalidad, sin saber en qué campo está cada cosa."
      >
        {(values, onValuesChange) => (
          <CommandPrototype
            fields={choreographyFilterFields}
            values={values}
            onValuesChange={onValuesChange}
          />
        )}
      </PrototypeSection>
      <PrototypeSection
        title="C · Panel lateral"
        description="El mismo disparador de hoy, pero abre un panel con una fila por campo. Es el único que no necesita una segunda maquetación para pantallas chicas."
      >
        {(values, onValuesChange) => (
          <SheetPrototype
            fields={choreographyFilterFields}
            values={values}
            onValuesChange={onValuesChange}
          />
        )}
      </PrototypeSection>
    </div>
  );
}

function PrototypeSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: (
    values: FilterValues,
    onValuesChange: (nextValues: FilterValues) => void,
  ) => ReactNode;
}) {
  const [values, setValues] = useState<FilterValues>(() =>
    createEmptyFilterValues(choreographyFilterFields),
  );
  const appliedFilters = getAppliedFilters(choreographyFilterFields, values);
  const canonicalSearch = buildFilterSearch(choreographyFilterFields, values);

  return (
    <section className="flex flex-col gap-3 border-t pt-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="rounded-lg border bg-background p-3">
        {children(values, setValues)}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">
          {appliedFilters.length === 1
            ? "1 filtro aplicado"
            : `${appliedFilters.length} filtros aplicados`}
        </Badge>
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
          {canonicalSearch.length > 0
            ? `/administracion/coreografias?${canonicalSearch}`
            : "/administracion/coreografias"}
        </code>
      </div>
    </section>
  );
}
