// PROTOTYPE — throwaway, lives only on branch `prototype/890-seminar-money-admin`.
//
// Part of the admin seminar-money prototype for wayfinder ticket #890 (map #884):
// `Bases del evento` › `Precios` with the seminar price list in a tab beside the
// choreography one, and the seminar price form with its guards (#904).
import { AlertTriangle, Info } from "lucide-react";
import { useId, useState } from "react";
import { Controller, useForm, type Control } from "react-hook-form";
import { toast } from "sonner";

import {
  AdminEmptyState,
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { BackButton, SubmitButton } from "@/components/shared/action-buttons";
import { BadgesList } from "@/components/shared/badges-list";
import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFiltersOf,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { SharedFieldLayout } from "@/components/shared/field-layout";
import { IntegerInputField } from "@/components/shared/integer-input-field";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { SelectField } from "@/components/shared/select-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PriceListTable } from "@/features/admin/prices/list-table";
import {
  formatAmount,
  formatPaymentDeadlineForTable,
  openEndedDeadlineLabel,
} from "@/features/admin/prices/view-shared";
import {
  formatParticipantBadgeLabel,
  formatParticipantsLabel,
  formatSeminarKindLabel,
  seminarKindOptions,
  type SeminarPriceRow,
  type SeminarPriceUsage,
} from "@/features/admin/seminars/prototype/seminar-money-fixtures.prototype";
import type { PriceListItem } from "@/lib/events/bases.server";
import { requiredFieldMessage } from "@/lib/shared/forms";
import { buildCreatePath } from "@/lib/shared/navigation";
import { cn } from "@/lib/shared/utils";

export const eventPricesTabs = ["coreografias", "seminarios"] as const;
export type EventPricesTab = (typeof eventPricesTabs)[number];

// The choreography guards' copy, re-keyed on the seminar row (#904 mirrors the
// built guards verbatim: any reference freezes everything but the name, the
// deadline-less `Común` row of a cell also keeps its amount editable).
const frozenDeleteError =
  "No se puede borrar el precio porque hay inscripciones que congelaron este precio.";

function describeProtectedCell(price: SeminarPriceRow) {
  return `es el único común sin fecha límite para ${formatParticipantsLabel(price.forParticipants).toLowerCase()}, y el evento tiene inscripciones activas a seminarios`;
}

export function refuseSeminarPriceDelete(
  price: SeminarPriceRow,
  usage: SeminarPriceUsage | undefined,
) {
  if (usage && usage.referencedCount > 0) {
    return frozenDeleteError;
  }

  return usage?.isProtected
    ? `No se puede borrar el precio porque ${describeProtectedCell(price)}.`
    : null;
}

export function EventPricesPrototype({
  activeTab,
  buildEditHref,
  choreographyPrices,
  missingBaseCells,
  newSeminarPriceHref,
  onTabChange,
  seminarPrices,
}: {
  activeTab: EventPricesTab;
  buildEditHref: (priceId: string) => string;
  choreographyPrices: unknown[];
  missingBaseCells: boolean[];
  newSeminarPriceHref: string;
  onTabChange: (tab: EventPricesTab) => void;
  seminarPrices: SeminarPriceRow[];
}) {
  return (
    <AdminResourceLayout
      selectedEventId="evento-prototipo"
      title="Precios"
      description="Revisá el alcance y el importe de cada precio del evento activo."
      // `Nuevo precio` opens the form of the active tab (#904).
      action={{
        label: "Nuevo precio",
        to:
          activeTab === "seminarios"
            ? newSeminarPriceHref
            : buildCreatePath("/administracion/precios", "evento-prototipo"),
      }}
    >
      <Tabs
        value={activeTab}
        onValueChange={(value) => onTabChange(value as EventPricesTab)}
      >
        <TabsList variant="line">
          <TabsTrigger value="coreografias">Coreografías</TabsTrigger>
          <TabsTrigger value="seminarios">Seminarios</TabsTrigger>
        </TabsList>
        <TabsContent value="coreografias" className="pt-2">
          {/* The real table, fed fixtures; its links go to the real routes. */}
          <PriceListTable
            prices={choreographyPrices as PriceListItem[]}
            selectedEventId="evento-prototipo"
          />
        </TabsContent>
        <TabsContent value="seminarios" className="flex flex-col gap-6 pt-2">
          {missingBaseCells.length > 0 ? (
            <Alert variant="warning">
              <AlertTriangle aria-hidden="true" />
              <AlertDescription>
                Los seminarios no abren la inscripción hasta que haya un precio
                común sin fecha límite para{" "}
                {missingBaseCells
                  .map((forParticipants) =>
                    formatParticipantsLabel(forParticipants).toLowerCase(),
                  )
                  .join(" y para ")}
                .
              </AlertDescription>
            </Alert>
          ) : null}
          {seminarPrices.length > 0 ? (
            <SeminarPriceListTable
              buildEditHref={buildEditHref}
              prices={seminarPrices}
            />
          ) : (
            <AdminEmptyState
              title="Todavía no hay precios de seminario."
              description="Creá un precio común sin fecha límite para participantes y otro para no participantes."
            />
          )}
        </TabsContent>
      </Tabs>
    </AdminResourceLayout>
  );
}

const seminarPriceFacetedFilterIds = [
  "tipo-de-seminario",
  "para-participantes",
] as const;

const seminarPriceFacetedFilters: DataTableFacetedFiltersOf<
  typeof seminarPriceFacetedFilterIds
> = [
  {
    id: "tipo-de-seminario",
    label: "Tipo de seminario",
    options: [...seminarKindOptions],
  },
  {
    id: "para-participantes",
    label: "Para participantes",
    options: [
      { label: "Sí", value: "yes" },
      { label: "No", value: "no" },
    ],
  },
];

/** The twin of `PriceListTable`: the participant flag rides as a second badge beside the kind. */
function SeminarPriceListTable({
  buildEditHref,
  prices,
}: {
  buildEditHref: (priceId: string) => string;
  prices: SeminarPriceRow[];
}) {
  const columns: DataTableColumn<SeminarPriceRow>[] = [
    {
      id: "name",
      header: "Nombre",
      className: "min-w-56 font-medium",
      cell: (price) => (
        <DataTableLink to={buildEditHref(price.id)}>{price.name}</DataTableLink>
      ),
      filterValue: (price) => price.name,
    },
    {
      id: "kind",
      header: "Tipo de seminario",
      cell: (price) => (
        <BadgesList
          labels={[
            formatSeminarKindLabel(price.kind),
            formatParticipantBadgeLabel(price.forParticipants),
          ]}
        />
      ),
      filterValues: (price) => [price.kind],
      filterValue: (price) => formatSeminarKindLabel(price.kind),
    },
    {
      id: "filters",
      header: "Filtros",
      cell: () => null,
      hidden: true,
      filterValues: (price) => [
        price.kind,
        price.forParticipants ? "yes" : "no",
      ],
    },
    {
      id: "paymentDeadline",
      header: "Fecha límite",
      cell: (price) => (
        <span className="text-muted-foreground">
          {formatPaymentDeadlineForTable(price.paymentDeadline)}
        </span>
      ),
      sortValue: (price) => price.paymentDeadline,
    },
    {
      id: "amount",
      header: "Importe",
      cell: (price) => formatAmount(price.amount),
    },
  ];

  return (
    <ClientDataTable
      rows={prices}
      columns={columns}
      getRowKey={(price) => price.id}
      searchPlaceholder="Buscar precio por nombre"
      textFilterColumnId="name"
      facetedFilters={seminarPriceFacetedFilters}
      emptyMessage="No hay precios que coincidan con la búsqueda."
      initialSort={{ columnId: "paymentDeadline", direction: "asc" }}
    />
  );
}

type SeminarPriceFormValues = {
  name: string;
  kind: string;
  forParticipants: boolean;
  isOpenEnded: boolean;
  paymentDeadline: string;
  amount: string;
};

/**
 * The seminar price form, under `Precios` like the choreography one and shaped
 * like it: `Nombre` carries the `Para participantes` switch as the choreography
 * name carries `Precio especial`. What the guards would refuse is locked on
 * sight (review on #890): a referenced row keeps only its name editable, the
 * protected deadline-less `Común` row keeps its name and amount, and the delete
 * dialog opens blocked.
 */
export function SeminarPriceFormPrototype({
  backHref,
  price,
  record,
  usage,
}: {
  backHref: string;
  price: SeminarPriceRow | null;
  record: (entry: string) => void;
  usage: SeminarPriceUsage | undefined;
}) {
  const formId = "prototype-seminar-price-form";
  const referencedCount = usage?.referencedCount ?? 0;
  const isFrozen = referencedCount > 0;
  const locksStructure = isFrozen || usage?.isProtected === true;
  const form = useForm<SeminarPriceFormValues>({
    defaultValues: {
      name: price?.name ?? "",
      kind: price?.kind ?? "regular",
      forParticipants: price?.forParticipants ?? true,
      isOpenEnded: price ? price.paymentDeadline === null : false,
      paymentDeadline: price?.paymentDeadline ?? "",
      amount: price ? String(price.amount) : "",
    },
  });
  const isOpenEnded = form.watch("isOpenEnded");
  const onSubmit = form.handleSubmit((values) => {
    toast.success("Prototipo: se habría guardado el precio.");
    record(`Guardar precio → ${JSON.stringify(values)}`);
  });

  return (
    <AdminResourceLayout
      selectedEventId="evento-prototipo"
      title={price ? "Editar precio" : "Nuevo precio"}
      description={
        price
          ? "Editá el nombre, el tipo de seminario, si es para participantes, el importe y la fecha límite de pago."
          : "Configurá el nombre, el tipo de seminario, si es para participantes, el importe y la fecha límite de pago."
      }
      headerAction={
        price ? (
          <SeminarPriceActions
            price={price}
            refusal={refuseSeminarPriceDelete(price, usage)}
          />
        ) : null
      }
    >
      <div className="flex flex-col gap-6">
        {price && locksStructure ? (
          <Alert variant="info">
            <Info aria-hidden="true" />
            <AlertDescription>
              {isFrozen
                ? `${
                    referencedCount === 1
                      ? "Una inscripción congeló"
                      : `${referencedCount} inscripciones congelaron`
                  } este precio: solo se le puede cambiar el nombre.`
                : `Este precio ${describeProtectedCell(price)}: solo se le pueden cambiar el nombre y el monto.`}
            </AlertDescription>
          </Alert>
        ) : null}
        <AdminResourceFormCard>
          <form
            id={formId}
            noValidate
            className="flex w-full flex-col gap-5"
            onSubmit={(event) => void onSubmit(event)}
          >
            <FieldGroup>
              <NameField
                control={form.control}
                locksParticipants={locksStructure}
              />
              <DateOnlyField
                control={form.control}
                name="paymentDeadline"
                disabled={isOpenEnded || locksStructure}
                id="prototype-seminar-price-deadline"
                label="Fecha límite de pago"
                labelAdornment={
                  <FormSwitch
                    control={form.control}
                    disabled={locksStructure}
                    label={openEndedDeadlineLabel}
                    name="isOpenEnded"
                    onToggle={(checked) => {
                      if (checked) {
                        form.setValue("paymentDeadline", "", {
                          shouldDirty: true,
                        });
                      }
                    }}
                  />
                }
              />
              <FieldGroup className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  control={form.control}
                  label="Tipo de seminario"
                  name="kind"
                  options={seminarKindOptions}
                  placeholder="Elegí un tipo"
                  disabled={locksStructure}
                />
                <IntegerInputField
                  control={form.control}
                  label="Monto"
                  min="1"
                  name="amount"
                  step="1"
                  disabled={isFrozen}
                />
              </FieldGroup>
            </FieldGroup>
          </form>
          <div className="flex items-center justify-between gap-2">
            <BackButton to={backHref} />
            <SubmitButton form={formId} isPending={false} />
          </div>
        </AdminResourceFormCard>
      </div>
    </AdminResourceLayout>
  );
}

/** `Nombre` with the `Para participantes` switch inside the input, as the choreography form's `Precio especial`. */
function NameField({
  control,
  locksParticipants,
}: {
  control: Control<SeminarPriceFormValues>;
  locksParticipants: boolean;
}) {
  const id = useId();

  return (
    <Controller
      control={control}
      name="name"
      rules={{
        validate: (value) => value.trim().length > 0 || requiredFieldMessage,
      }}
      render={({ field, fieldState }) => (
        <SharedFieldLayout
          error={fieldState.error?.message}
          id={id}
          label="Nombre"
        >
          {({ describedBy, isInvalid }) => (
            <div className="relative">
              <Input
                id={id}
                aria-describedby={describedBy || undefined}
                aria-invalid={isInvalid ? true : undefined}
                autoComplete="off"
                className="pr-14"
                {...field}
              />
              <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center">
                <FormSwitch
                  control={control}
                  disabled={locksParticipants}
                  label="Para participantes"
                  name="forParticipants"
                />
              </div>
            </div>
          )}
        </SharedFieldLayout>
      )}
    />
  );
}

/** The choreography form's switch shape: tooltip on the control, an optional side effect on toggle. */
function FormSwitch({
  control,
  disabled,
  label,
  name,
  onToggle,
}: {
  control: Control<SeminarPriceFormValues>;
  disabled: boolean;
  label: string;
  name: "forParticipants" | "isOpenEnded";
  onToggle?: (checked: boolean) => void;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Switch
                aria-label={label}
                className={cn(
                  "border-border shadow-xs",
                  field.value ? "!bg-primary" : "!bg-muted",
                )}
                checked={field.value}
                disabled={disabled}
                onBlur={field.onBlur}
                onCheckedChange={(checked) => {
                  field.onChange(checked);
                  onToggle?.(checked);
                }}
              />
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    />
  );
}

/** The delete dialog opens blocked when a guard would refuse it. */
function SeminarPriceActions({
  price,
  refusal,
}: {
  price: SeminarPriceRow;
  refusal: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <ResourceActionsMenu
        contentClassName="w-48"
        contentProps={{ forceMount: true }}
        size="icon"
      >
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setOpen(true)}
          >
            Borrar precio
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </ResourceActionsMenu>
      <DeleteDialog
        title="Eliminar precio"
        description={`Esta acción borra ${price.name} si no tiene dependencias asociadas. No se puede deshacer.`}
        intentValue="delete-seminar-price"
        isBlocked={refusal !== null}
        blockedDescription={refusal}
        recordId={price.id}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
