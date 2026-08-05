/**
 * THROWAWAY PROTOTYPE — the happy-path summary step for ticket #623.
 *
 * The real one is `create/summary.tsx`; it needs a full `RegistrationResolution`,
 * which the prototype does not build. This is only here so the flow has an end
 * to reach when the refusal does not fire.
 */
import { AccessNotice } from "@/components/auth/access-ui";
import { FieldLabel } from "@/components/ui/field";

import {
  prototypeCategoryLabel,
  prototypeChoreographyName,
  prototypeDancers,
  prototypeModalityLabel,
} from "./fixtures";
import { formatOptionLabel, type PrototypeWizard } from "./wizard";

export function PrototypeSummary({ wizard }: { wizard: PrototypeWizard }) {
  const option = wizard.selectedOption ?? wizard.soleOption;
  const dancerIds = wizard.form.getValues("dancerIds") ?? [];

  const items = [
    { label: "Nombre", value: prototypeChoreographyName },
    { label: "Modalidad", value: prototypeModalityLabel },
    {
      label: "Categoría",
      value: `${prototypeCategoryLabel} · ${wizard.groupTypeLabel}`,
    },
    { label: "Cronograma", value: option ? formatOptionLabel(option) : "—" },
    {
      label: "Bailarines",
      value: prototypeDancers
        .filter((dancer) => dancerIds.includes(dancer.id))
        .map((dancer) => `${dancer.firstName} ${dancer.lastName}`)
        .join(", "),
    },
  ];

  return (
    <section aria-label="Resumen de coreografía">
      <FieldLabel>Resumen</FieldLabel>
      <div className="mt-3">
        <AccessNotice variant="info">
          Revisá los datos ya que una vez guardados no vas a poder modificarlos.
        </AccessNotice>
      </div>
      <dl className="mt-3 flex flex-col gap-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-baseline gap-3">
            <dt className="min-w-40 text-xs font-semibold uppercase text-muted-foreground">
              {item.label}
            </dt>
            <dd className="text-sm">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
