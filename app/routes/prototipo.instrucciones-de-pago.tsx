// PROTOTYPE ROUTE — throwaway, lives only on this branch. `pnpm dev` and open
// /prototipo/instrucciones-de-pago to compare the three payment instructions
// cards of wayfinder ticket #870. No loader, no auth, no database.
import { HandCoins } from "lucide-react";
import { useSearchParams } from "react-router";

import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import {
  PaymentInstructionsAlertGridVariant,
  PaymentInstructionsCardVariant,
  type PrototypePaymentInstructions,
} from "@/features/portal/payments/prototype/payment-instructions-card.prototype";

const fullInstructions: PrototypePaymentInstructions = {
  holderName: "En Escena Producciones SRL",
  bankName: "Banco Galicia",
  cbu: "0070099930004512345678",
  cvu: "0000003100010000000001",
  alias: "en.escena.pagos",
  holderCuit: "30712345674",
  text: "Poné el nombre de tu academia en la referencia de la transferencia.\nMandanos el comprobante por WhatsApp al 341 555-0100.\n\nTambién podés pagar con Mercado Pago: https://link.mercadopago.com.ar/enescena",
};

const casesById = {
  completo: fullInstructions,
  "solo-texto": {
    holderName: null,
    bankName: null,
    cbu: null,
    cvu: null,
    alias: null,
    holderCuit: null,
    text: "Pagá en efectivo en la sede, de lunes a viernes de 15 a 20.",
  },
  "solo-datos": {
    ...fullInstructions,
    alias: null,
    bankName: null,
    holderCuit: null,
    text: null,
  },
  "solo-cvu": {
    ...fullInstructions,
    cbu: null,
    bankName: "Mercado Pago",
  },
  "texto-largo": {
    ...fullInstructions,
    text: "Las transferencias se acreditan en 24 horas hábiles. Hasta que administración registre el pago, la coreografía sigue figurando como impaga.\n\nSi transferís desde una cuenta que no está a nombre de la academia, avisanos antes: el banco muestra el titular de origen y necesitamos poder identificarlo.\n\nNo aceptamos pagos parciales por debajo del anticipo del evento.",
  },
} satisfies Record<string, PrototypePaymentInstructions>;

const variantsById = {
  "alerta-grilla": {
    label: "Alert info + grilla",
    Component: PaymentInstructionsAlertGridVariant,
  },
  tarjeta: {
    label: "Card + grilla",
    Component: PaymentInstructionsCardVariant,
  },
} satisfies Record<
  string,
  {
    label: string;
    Component: (props: {
      instructions: PrototypePaymentInstructions;
    }) => React.ReactNode;
  }
>;

const contentsById = {
  vacio: "Sin pagos (empty state)",
  lista: "Con pagos (lista)",
} satisfies Record<string, string>;

function resolveParam<T extends Record<string, unknown>>(
  searchParams: URLSearchParams,
  key: string,
  options: T,
  fallback: keyof T,
): keyof T {
  const value = searchParams.get(key) ?? "";

  return value in options ? (value as keyof T) : fallback;
}

export default function PaymentInstructionsPrototypeRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const variantId = resolveParam(
    searchParams,
    "variante",
    variantsById,
    "alerta-grilla",
  );
  const caseId = resolveParam(searchParams, "caso", casesById, "completo");
  const contentId = resolveParam(
    searchParams,
    "contenido",
    contentsById,
    "vacio",
  );

  const instructions = casesById[caseId];
  const Card = variantsById[variantId].Component;

  function setParam(key: string, value: string) {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set(key, value);
      return next;
    });
  }

  return (
    <div className="min-h-svh bg-background px-4 py-6 pb-32">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <PortalListPage
          titleId="pagos-title"
          title="Pagos"
          description="Consultá los pagos que administración registró para tu academia."
        >
          <Card instructions={instructions} />

          {contentId === "lista" ? (
            <FakePaymentsTable />
          ) : (
            <PortalEmptyState
              title="Todavía no hay pagos registrados"
              description="Cuando administración registre un pago de tu academia en este evento, lo vas a poder revisar acá."
              icon={<HandCoins aria-hidden="true" />}
            />
          )}
        </PortalListPage>
      </div>

      <SwitcherBar
        variantId={variantId}
        caseId={caseId}
        contentId={contentId}
        onSelect={setParam}
      />
    </div>
  );
}

function SwitcherBar({
  variantId,
  caseId,
  contentId,
  onSelect,
}: {
  variantId: string;
  caseId: string;
  contentId: string;
  onSelect: (key: string, value: string) => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card px-4 py-3">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 text-xs">
        <SwitcherRow
          legend="Variante"
          options={Object.entries(variantsById).map(([id, entry]) => ({
            id,
            label: entry.label,
          }))}
          activeId={variantId}
          onSelect={(id) => onSelect("variante", id)}
        />
        <SwitcherRow
          legend="Caso"
          options={Object.keys(casesById).map((id) => ({ id, label: id }))}
          activeId={caseId}
          onSelect={(id) => onSelect("caso", id)}
        />
        <SwitcherRow
          legend="Contenido"
          options={Object.entries(contentsById).map(([id, label]) => ({
            id,
            label,
          }))}
          activeId={contentId}
          onSelect={(id) => onSelect("contenido", id)}
        />
      </div>
    </div>
  );
}

function SwitcherRow({
  legend,
  options,
  activeId,
  onSelect,
}: {
  legend: string;
  options: Array<{ id: string; label: string }>;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-20 text-muted-foreground">{legend}</span>
      {options.map((option) => (
        <Button
          key={option.id}
          type="button"
          size="xs"
          variant={option.id === activeId ? "default" : "outline"}
          onClick={() => onSelect(option.id)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

function FakePaymentsTable() {
  const rows = [
    { number: "0001", date: "12 de marzo de 2026", amount: "$ 120.000" },
    { number: "0002", date: "2 de abril de 2026", amount: "$ 80.000" },
  ];

  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Fecha</th>
            <th className="px-3 py-2 text-right font-medium">Monto</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.number} className="border-t border-border">
              <td className="px-3 py-2 tabular-nums">{row.number}</td>
              <td className="px-3 py-2">{row.date}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {row.amount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
