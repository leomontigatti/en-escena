// PROTOTYPE — throwaway, lives only on branch `prototype/890-seminar-money-admin`.
//
// Part of the admin seminar-money prototype for wayfinder ticket #890 (map #884):
// `Bases del evento` › `Precios` with the seminar price list in a tab beside the
// choreography one, and the seminar price form with its guards (#904).
import { AlertTriangle, Info } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, type Control } from "react-hook-form";
import { toast } from "sonner";

import {
  AdminEmptyState,
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { BackButton, SubmitButton } from "@/components/shared/action-buttons";
import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFiltersOf,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { IntegerInputField } from "@/components/shared/integer-input-field";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { SelectField } from "@/components/shared/select-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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
  formatParticipantsLabel,
  formatSeminarKindLabel,
  getSeminarPriceDisplayName,
  seminarKindOptions,
  type SeminarPriceRow,
  type SeminarPriceUsage,
} from "@/features/admin/seminars/prototype/seminar-money-fixtures.prototype";
import type { PriceListItem } from "@/lib/events/bases.server";
import { buildCreatePath } from "@/lib/shared/navigation";
import { cn } from "@/lib/shared/utils";

export const eventPricesTabs = ["coreografias", "seminarios"] as const;
export type EventPricesTab = (typeof eventPricesTabs)[number];

// The choreography guards' copy, re-keyed on the seminar row (#904 mirrors the
// built guards verbatim: any reference freezes everything, the deadline-less
// `Común` row of a cell only lets its amount change).
const frozenUpdateError =
  "No se pueden editar monto, tipo de seminario, participantes ni vencimiento porque hay inscripciones que congelaron este precio.";
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

function refuseSeminarPriceUpdate(
  price: SeminarPriceRow,
  usage: SeminarPriceUsage | undefined,
  change: { amountChanged: boolean; structureChanged: boolean },
) {
  if (
    usage &&
    usage.referencedCount > 0 &&
    (change.amountChanged || change.structureChanged)
  ) {
    return frozenUpdateError;
  }

  return usage?.isProtected && change.structureChanged
    ? `No se puede editar el precio porque ${describeProtectedCell(price)}. Podés cambiarle el monto.`
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

/** The twin of `PriceListTable`: no name, so the link reads the built display name. */
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
        <DataTableLink to={buildEditHref(price.id)}>
          {getSeminarPriceDisplayName(price)}
        </DataTableLink>
      ),
      filterValue: getSeminarPriceDisplayName,
    },
    {
      id: "kind",
      header: "Tipo de seminario",
      cell: (price) => (
        <Badge variant="secondary">{formatSeminarKindLabel(price.kind)}</Badge>
      ),
      filterValues: (price) => [price.kind],
      filterValue: (price) => formatSeminarKindLabel(price.kind),
    },
    {
      id: "forParticipants",
      header: "Para participantes",
      cell: (price) => (
        <Badge variant="outline">{price.forParticipants ? "Sí" : "No"}</Badge>
      ),
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
  kind: string;
  forParticipants: boolean;
  isOpenEnded: boolean;
  paymentDeadline: string;
  amount: string;
};

/**
 * The seminar price form, under `Precios` like the choreography one. Variant A
 * refuses on save and on delete, as the choreography price does today; variant
 * B locks what the guard would refuse on sight and blocks the delete dialog.
 */
export function SeminarPriceFormPrototype({
  backHref,
  price,
  record,
  usage,
  variant,
}: {
  backHref: string;
  price: SeminarPriceRow | null;
  record: (entry: string) => void;
  usage: SeminarPriceUsage | undefined;
  variant: string;
}) {
  const formId = "prototype-seminar-price-form";
  const locksOnSight = variant === "B";
  const isFrozen = (usage?.referencedCount ?? 0) > 0;
  const locksAmount = locksOnSight && isFrozen;
  const locksStructure =
    locksOnSight && (isFrozen || usage?.isProtected === true);
  const form = useForm<SeminarPriceFormValues>({
    defaultValues: {
      kind: price?.kind ?? "regular",
      forParticipants: price?.forParticipants ?? true,
      isOpenEnded: price ? price.paymentDeadline === null : false,
      paymentDeadline: price?.paymentDeadline ?? "",
      amount: price ? String(price.amount) : "",
    },
  });
  const isOpenEnded = form.watch("isOpenEnded");
  const onSubmit = form.handleSubmit((values) => {
    const refusal = price
      ? refuseSeminarPriceUpdate(price, usage, {
          amountChanged: Number(values.amount) !== price.amount,
          structureChanged:
            values.kind !== price.kind ||
            values.forParticipants !== price.forParticipants ||
            (values.isOpenEnded ? null : values.paymentDeadline) !==
              price.paymentDeadline,
        })
      : null;

    if (refusal) {
      toast.error(refusal);
      record(`Guardar precio → rechazado: ${refusal}`);
      return;
    }

    toast.success("Prototipo: se habría guardado el precio.");
    record(`Guardar precio → ${JSON.stringify(values)}`);
  });

  return (
    <AdminResourceLayout
      selectedEventId="evento-prototipo"
      title={price ? "Editar precio" : "Nuevo precio"}
      description={
        price
          ? "Editá el tipo de seminario, si es para participantes, el importe y la fecha límite de pago."
          : "Configurá el tipo de seminario, si es para participantes, el importe y la fecha límite de pago."
      }
      headerAction={
        price ? (
          <SeminarPriceActions
            price={price}
            refusal={
              locksOnSight ? refuseSeminarPriceDelete(price, usage) : null
            }
          />
        ) : null
      }
    >
      <div className="flex flex-col gap-6">
        {price && locksOnSight && (isFrozen || usage?.isProtected) ? (
          <Alert>
            <Info aria-hidden="true" />
            <AlertDescription>
              {isFrozen
                ? `${usage?.referencedCount} inscripciones congelaron este precio: no se puede editar ni borrar.`
                : `Este precio ${describeProtectedCell(price)}: solo se le puede cambiar el monto.`}
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
              <DateOnlyField
                control={form.control}
                name="paymentDeadline"
                disabled={isOpenEnded || locksStructure}
                id="prototype-seminar-price-deadline"
                label="Fecha límite de pago"
                labelAdornment={
                  <OpenEndedSwitch
                    control={form.control}
                    disabled={locksStructure}
                    onChecked={() =>
                      form.setValue("paymentDeadline", "", {
                        shouldDirty: true,
                      })
                    }
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
                  disabled={locksAmount}
                />
              </FieldGroup>
              <Controller
                control={form.control}
                name="forParticipants"
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <Switch
                      id="prototype-seminar-price-participants"
                      checked={field.value}
                      disabled={locksStructure}
                      onCheckedChange={field.onChange}
                    />
                    <FieldLabel htmlFor="prototype-seminar-price-participants">
                      Para participantes
                    </FieldLabel>
                  </Field>
                )}
              />
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

function OpenEndedSwitch({
  control,
  disabled,
  onChecked,
}: {
  control: Control<SeminarPriceFormValues>;
  disabled: boolean;
  onChecked: () => void;
}) {
  return (
    <Controller
      control={control}
      name="isOpenEnded"
      render={({ field }) => (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Switch
                aria-label={openEndedDeadlineLabel}
                className={cn(
                  "border-border shadow-xs",
                  field.value ? "!bg-primary" : "!bg-muted",
                )}
                checked={field.value}
                disabled={disabled}
                onCheckedChange={(checked) => {
                  field.onChange(checked);

                  if (checked) {
                    onChecked();
                  }
                }}
              />
            </TooltipTrigger>
            <TooltipContent>{openEndedDeadlineLabel}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    />
  );
}

/** Variant A lets the dialog post and the action refuse; variant B opens it blocked. */
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
        description={`Esta acción borra ${getSeminarPriceDisplayName(price)} si no tiene dependencias asociadas. No se puede deshacer.`}
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
