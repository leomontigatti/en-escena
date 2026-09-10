// PROTOTYPE — throwaway, lives only on branch `prototype/890-seminar-money-admin`.
//
// Part of the admin seminar-money prototype for wayfinder ticket #890 (map #884):
// the seminar detail variants and their information and prices forms.
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { BackButton, SubmitButton } from "@/components/shared/action-buttons";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { IntegerInputField } from "@/components/shared/integer-input-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { TimeOnlyField } from "@/components/shared/time-only-field";
import { FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SeminarActions } from "@/features/admin/seminars/actions";
import { SeminarInscriptionsTable } from "@/features/admin/seminars/inscriptions-table";
import { formatAvailablePlacesSuffix } from "@/features/admin/schedules/view-shared";
import type { SeminarListItem } from "@/lib/seminars/repository.server";
import {
  type PrototypeSeminar,
  type SeminarInscriptionFigures,
  type TierUsage,
} from "./seminar-money-fixtures.prototype";
import {
  type SeminarPrototypeFormValues,
  type SeminarForm,
  SeminarTierRows,
  validateTierRows,
} from "./seminar-tier-rows.prototype";
import { SeminarTierTable } from "./seminar-tier-table.prototype";

const selectedEventId = "evento-prototipo";

type Record = (entry: string) => void;

function toFormValues(seminar: PrototypeSeminar): SeminarPrototypeFormValues {
  return {
    instructorName: seminar.instructorName,
    scheduledDate: seminar.scheduledDate,
    startTime: seminar.startTime,
    quota: String(seminar.quota),
    requiredDepositPercentage: String(seminar.requiredDepositPercentage),
    tiers: seminar.tiers.map((tier) => ({
      tierId: tier.id,
      paymentDeadline: tier.paymentDeadline ?? "",
      participantAmount: String(tier.participantAmount),
      nonParticipantAmount: String(tier.nonParticipantAmount),
    })),
  };
}

/**
 * A — `Precios` is a third tab: a table of tiers, `Nuevo precio` opens a dialog,
 * and a tier's deadline opens the same dialog to edit or delete it. The rate
 * rides on `Información`, as `Seña (%)` rides on the event form.
 *
 * B — no new tab: the rate joins `Información` and the tiers are inline rows
 * under it, like the schedule capacities. One `Guardar` for everything.
 *
 * C — `Precios` is a third tab holding its own form: the rate and the inline
 * tier rows together, with their own `Guardar`. `Información` stays as it is.
 */
export function SeminarDetailPrototype({
  backHref,
  inscriptions,
  record,
  seminar,
  tierUsage,
  variant,
}: {
  backHref: string;
  inscriptions: SeminarInscriptionFigures[];
  record: Record;
  seminar: PrototypeSeminar;
  tierUsage: { [tierId: string]: TierUsage };
  variant: string;
}) {
  const seminarListItem = {
    id: seminar.id,
    instructorName: seminar.instructorName,
    inscriptionCount: seminar.registeredCount,
  } as SeminarListItem;

  return (
    <AdminResourceLayout
      selectedEventId={selectedEventId}
      title="Editar seminario"
      description={
        variant === "B"
          ? "Editá el instructor, su foto, la fecha, la hora, el cupo, la seña y los precios del seminario."
          : "Editá el instructor, su foto, la fecha, la hora y el cupo del seminario."
      }
      headerAction={<SeminarActions seminar={seminarListItem} />}
    >
      <Tabs defaultValue={variant === "B" ? "informacion" : "precios"}>
        <TabsList variant="line">
          <TabsTrigger value="informacion">Información</TabsTrigger>
          {variant === "B" ? null : (
            <TabsTrigger value="precios">Precios</TabsTrigger>
          )}
          <TabsTrigger value="inscriptos">Inscriptos</TabsTrigger>
        </TabsList>
        <TabsContent value="informacion" className="pt-2">
          <SeminarInformationForm
            backHref={backHref}
            includeRate={variant !== "C"}
            includeTiers={variant === "B"}
            record={record}
            seminar={seminar}
            tierUsage={tierUsage}
          />
        </TabsContent>
        {variant === "A" ? (
          <TabsContent value="precios" className="pt-2">
            <SeminarTierTable
              record={record}
              seminar={seminar}
              tierUsage={tierUsage}
            />
          </TabsContent>
        ) : null}
        {variant === "C" ? (
          <TabsContent value="precios" className="pt-2">
            <SeminarPricesForm
              backHref={backHref}
              record={record}
              seminar={seminar}
              tierUsage={tierUsage}
            />
          </TabsContent>
        ) : null}
        <TabsContent value="inscriptos" className="pt-2">
          {/* The real roster, unchanged: active rows only and no money (#889). */}
          <SeminarInscriptionsTable
            inscriptions={inscriptions
              .filter((inscription) => !inscription.withdrawn)
              .map((inscription) => ({
                id: inscription.id,
                fullName: inscription.fullName,
                personKind: inscription.personKind,
                academyName: inscription.academyName,
              }))}
          />
        </TabsContent>
      </Tabs>
    </AdminResourceLayout>
  );
}

function SeminarInformationForm({
  backHref,
  includeRate,
  includeTiers,
  record,
  seminar,
  tierUsage,
}: {
  backHref: string;
  includeRate: boolean;
  includeTiers: boolean;
  record: Record;
  seminar: PrototypeSeminar;
  tierUsage: { [tierId: string]: TierUsage };
}) {
  const formId = "prototype-seminar-information-form";
  const form = useForm<SeminarPrototypeFormValues>({
    defaultValues: toFormValues(seminar),
  });
  const onSubmit = form.handleSubmit((values) => {
    if (includeTiers && !validateTierRows(values.tiers, form)) {
      return;
    }

    // The quota floor is a server refusal, so it is a toast (style guide).
    if (Number(values.quota) < seminar.coveredCount) {
      toast.error(
        `El cupo no puede ser menor a las ${seminar.coveredCount} inscripciones con la seña cubierta.`,
      );
      return;
    }

    const { tiers, requiredDepositPercentage, ...information } = values;
    toast.success("Prototipo: se habría guardado el seminario.");
    record(
      `Guardar seminario → ${JSON.stringify({
        ...information,
        ...(includeRate ? { requiredDepositPercentage } : {}),
        ...(includeTiers ? { tiers } : {}),
      })}`,
    );
  });

  return (
    <AdminResourceFormCard>
      <form
        id={formId}
        noValidate
        className="flex w-full flex-col gap-5"
        onSubmit={(event) => void onSubmit(event)}
      >
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <TextInputField
            control={form.control}
            label="Instructor"
            name="instructorName"
          />
          <IntegerInputField
            control={form.control}
            label="Cupo"
            min={1}
            name="quota"
            step={1}
            suffix={formatAvailablePlacesSuffix(
              seminar.quota - seminar.coveredCount,
            )}
          />
          <DateOnlyField
            control={form.control}
            name="scheduledDate"
            id="prototype-seminar-date"
            label="Fecha"
            buttonClassName="w-full"
          />
          <TimeOnlyField control={form.control} label="Hora" name="startTime" />
          {includeRate ? (
            <DepositRateField form={form} seminar={seminar} />
          ) : null}
        </FieldGroup>
        {includeTiers ? (
          <FieldSet>
            <FieldLegend>Precios</FieldLegend>
            <SeminarTierRows form={form} tierUsage={tierUsage} />
          </FieldSet>
        ) : null}
      </form>
      <FormActions backHref={backHref} formId={formId} />
    </AdminResourceFormCard>
  );
}

function SeminarPricesForm({
  backHref,
  record,
  seminar,
  tierUsage,
}: {
  backHref: string;
  record: Record;
  seminar: PrototypeSeminar;
  tierUsage: { [tierId: string]: TierUsage };
}) {
  const formId = "prototype-seminar-prices-form";
  const form = useForm<SeminarPrototypeFormValues>({
    defaultValues: toFormValues(seminar),
  });
  const onSubmit = form.handleSubmit((values) => {
    if (!validateTierRows(values.tiers, form)) {
      return;
    }

    toast.success("Prototipo: se habrían guardado los precios.");
    record(
      `Guardar precios → ${JSON.stringify({
        requiredDepositPercentage: values.requiredDepositPercentage,
        tiers: values.tiers,
      })}`,
    );
  });

  return (
    <AdminResourceFormCard>
      <form
        id={formId}
        noValidate
        className="flex w-full flex-col gap-5"
        onSubmit={(event) => void onSubmit(event)}
      >
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <DepositRateField form={form} seminar={seminar} />
        </FieldGroup>
        <FieldSet>
          <FieldLegend>Precios</FieldLegend>
          <SeminarTierRows form={form} tierUsage={tierUsage} />
        </FieldSet>
      </form>
      <FormActions backHref={backHref} formId={formId} />
    </AdminResourceFormCard>
  );
}

function FormActions({
  backHref,
  formId,
}: {
  backHref: string;
  formId: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <BackButton to={backHref} />
      <SubmitButton form={formId} isPending={false} />
    </div>
  );
}

/**
 * `Seña (%)`, labelled as the event's. Locked while any inscription is covered
 * (#885 guard 3), shown as the lock the shared field draws rather than as a
 * refusal after `Guardar`.
 */
function DepositRateField({
  form,
  seminar,
}: {
  form: SeminarForm;
  seminar: PrototypeSeminar;
}) {
  const isLocked = seminar.coveredCount > 0;

  return (
    <IntegerInputField
      control={form.control}
      label="Seña (%)"
      name="requiredDepositPercentage"
      min={1}
      max={100}
      step={1}
      disabled={isLocked}
      description={
        isLocked
          ? "No se puede cambiar mientras haya inscripciones con la seña cubierta."
          : undefined
      }
    />
  );
}
