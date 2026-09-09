// PROTOTYPE ROUTE — throwaway, lives only on this branch. `pnpm dev` and open
// /prototipo/instrucciones-de-pago-admin to see the admin side of the payment
// instructions of wayfinder ticket #882. No loader, no auth, no database:
// "Guardar" validates and prints what it would have posted.
//
// The documents panel is the *real* `EventDocumentsFields`, on purpose: the
// guard rail worth testing is that a PDF chosen there survives a tab switch.
import { useState } from "react";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { BackButton, SubmitButton } from "@/components/shared/action-buttons";
import { Button } from "@/components/ui/button";
import {
  EventDocumentsFields,
  useEventDocumentsForm,
} from "@/features/admin/events/detail/documents-fields";
import {
  EventFormTabs,
  PrototypeEventFields,
  usePrototypeEventForm,
  type PrototypeEventFormValues,
} from "@/features/admin/events/detail/prototype/payment-instructions-form.prototype";
import type { EventDocumentSummaries } from "@/lib/events/event-documents.server";

const baseEventValues = {
  name: "En Escena 2026",
  requiredDepositPercentage: "30",
  startsAt: "2026-10-02",
  endsAt: "2026-10-04",
  registrationStartsAt: "2026-07-01",
  registrationEndsAt: "2026-09-15",
};

const emptyInstructions = {
  paymentInstructionsHolderName: "",
  paymentInstructionsBankName: "",
  paymentInstructionsCbu: "",
  paymentInstructionsAlias: "",
  paymentInstructionsHolderCuit: "",
  paymentInstructionsText: "",
};

const casesById = {
  // Nothing loaded yet: the portal card does not render at all.
  vacio: { ...baseEventValues, ...emptyInstructions },
  // Everything loaded.
  completo: {
    ...baseEventValues,
    paymentInstructionsHolderName: "En Escena Producciones SRL",
    paymentInstructionsBankName: "Banco Galicia",
    paymentInstructionsCbu: "0070099330004512345678",
    paymentInstructionsAlias: "en.escena.pagos",
    paymentInstructionsHolderCuit: "30-71234567-1",
    paymentInstructionsText:
      "Poné el nombre de tu academia en la referencia de la transferencia.\nMandanos el comprobante por WhatsApp al 341 555-0100.",
  },
  // The text alone: legal per the group rule, and the card still renders.
  "solo-texto": {
    ...baseEventValues,
    ...emptyInstructions,
    paymentInstructionsText:
      "Pagá en efectivo en la sede, de lunes a viernes de 15 a 20.",
  },
  // An alias with no CBU/CVU and no titular: submit to see the group rule fire
  // on two fields at once.
  "grupo-incompleto": {
    ...baseEventValues,
    ...emptyInstructions,
    paymentInstructionsAlias: "en.escena.pagos",
  },
  // Three bad identifiers: wrong check digits, an alias with a space, a CUIT
  // whose last digit does not check out.
  "identificadores-invalidos": {
    ...baseEventValues,
    paymentInstructionsHolderName: "En Escena Producciones SRL",
    paymentInstructionsBankName: "Banco Galicia",
    paymentInstructionsCbu: "0070099930004512345670",
    paymentInstructionsAlias: "en escena",
    paymentInstructionsHolderCuit: "30-71234567-9",
    paymentInstructionsText: "",
  },
  // Over the 2000-character cap: watch the counter turn destructive.
  "texto-largo": {
    ...baseEventValues,
    ...emptyInstructions,
    paymentInstructionsText:
      "Las transferencias se acreditan en 24 horas. ".repeat(50),
  },
} satisfies Record<string, PrototypeEventFormValues>;

const documentsById = {
  "sin-documentos": buildDocuments(false),
  "con-documentos": buildDocuments(true),
} satisfies Record<string, EventDocumentSummaries>;

function buildDocuments(loaded: boolean): EventDocumentSummaries {
  const summary = loaded
    ? { downloadUrl: "#prototipo", uploadedAt: new Date("2026-08-01") }
    : null;

  return {
    professor_contract: summary,
    minor_authorization: summary,
    adult_contract: summary,
  };
}

export default function PaymentInstructionsAdminPrototypeRoute() {
  const [caseId, setCaseId] = useState<keyof typeof casesById>("completo");
  const [documentsId, setDocumentsId] =
    useState<keyof typeof documentsById>("sin-documentos");
  const [submitted, setSubmitted] = useState<PrototypeEventFormValues | null>(
    null,
  );

  const form = usePrototypeEventForm(casesById[caseId]);
  const documentsForm = useEventDocumentsForm(documentsById[documentsId]);

  const onSubmit = form.handleSubmit((values) => {
    setSubmitted(values);
  });

  return (
    <div className="min-h-svh bg-background px-4 py-6 pb-48">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <AdminResourceLayout
          title="Editar evento"
          description="Editá fechas, visibilidad y estado operativo del evento."
          requireSelectedEvent={false}
        >
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              setSubmitted(null);
              void onSubmit(event);
            }}
          >
            <AdminResourceFormCard
              footer={
                <>
                  <BackButton to="/prototipo/instrucciones-de-pago-admin" />
                  {/* The one "Guardar" of the card, outside the tabs. Never
                      disabled: an invalid identifier is reported as a field
                      error on submit, not hidden behind a dead button. */}
                  <SubmitButton isPending={false} />
                </>
              }
            >
              <PrototypeEventFields form={form} />
              <EventFormTabs
                form={form}
                documentsPanel={
                  <EventDocumentsFields
                    controller={documentsForm}
                    documents={documentsById[documentsId]}
                  />
                }
              />
            </AdminResourceFormCard>
          </form>
        </AdminResourceLayout>

        <SubmittedState submitted={submitted} errors={form.formState.errors} />
      </div>

      <SwitcherBar
        caseId={caseId}
        documentsId={documentsId}
        onCase={(id) => {
          setSubmitted(null);
          setCaseId(id as keyof typeof casesById);
        }}
        onDocuments={(id) => setDocumentsId(id as keyof typeof documentsById)}
      />
    </div>
  );
}

/** Rule 5 of the prototype skill: show the state after every action. */
function SubmittedState({
  errors,
  submitted,
}: {
  errors: Record<string, { message?: string } | undefined>;
  submitted: PrototypeEventFormValues | null;
}) {
  const errorEntries = Object.entries(errors).filter(([, error]) => error);

  return (
    <div className="rounded-xl border border-border bg-card p-4 text-xs">
      <p className="mb-2 font-medium">Estado del formulario</p>
      {errorEntries.length > 0 ? (
        <ul className="list-disc pl-5 text-destructive">
          {errorEntries.map(([field, error]) => (
            <li key={field}>
              <span className="font-mono">{field}</span>: {error?.message}
            </li>
          ))}
        </ul>
      ) : null}
      {submitted ? (
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-muted-foreground">
          {JSON.stringify(submitted, null, 2)}
        </pre>
      ) : (
        <p className="text-muted-foreground">
          Todavía no se envió nada (o el envío falló).
        </p>
      )}
    </div>
  );
}

function SwitcherBar({
  caseId,
  documentsId,
  onCase,
  onDocuments,
}: {
  caseId: string;
  documentsId: string;
  onCase: (id: string) => void;
  onDocuments: (id: string) => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card px-4 py-3">
      <div className="mx-auto flex max-w-4xl flex-col gap-2 text-xs">
        <SwitcherRow
          legend="Caso"
          options={Object.keys(casesById)}
          activeId={caseId}
          onSelect={onCase}
        />
        <SwitcherRow
          legend="Documentos"
          options={Object.keys(documentsById)}
          activeId={documentsId}
          onSelect={onDocuments}
        />
      </div>
    </div>
  );
}

function SwitcherRow({
  activeId,
  legend,
  onSelect,
  options,
}: {
  activeId: string;
  legend: string;
  onSelect: (id: string) => void;
  options: string[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-24 text-muted-foreground">{legend}</span>
      {options.map((option) => (
        <Button
          key={option}
          type="button"
          size="xs"
          variant={option === activeId ? "default" : "outline"}
          onClick={() => onSelect(option)}
        >
          {option}
        </Button>
      ))}
    </div>
  );
}
