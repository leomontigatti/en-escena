import { Link } from "react-router";
import { Check, Info, Trash } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Controller,
  type SubmitHandler,
  useForm,
  type UseFormReturn,
} from "react-hook-form";
import { z } from "zod";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { DateOnlyField } from "@/components/shared/date-only-field";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  PriceListItem,
  ScheduleListItem,
} from "@/lib/events/bases.server";
import type {
  ActionData,
  PriceActionValues,
} from "@/lib/admin/events/bases-action.server";
import { groupTypeLabels, groupTypeOptions } from "@/lib/events/group-types";
import type { EventBasesLoaderData } from "@/lib/admin/events/bases-route.server";
import {
  requiredFieldMessage,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

type EventBaseAreaProps = {
  loaderData: EventBasesLoaderData;
  actionData?: ActionData;
};

const PRICE_SCHEDULE_ALERT_TEXT =
  "El precio base aplica cuando no existe un precio específico para el cronograma.";
const EMPTY_SCHEDULE_VALUE = "__empty_schedule__";
const priceDateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "numeric",
  year: "2-digit",
  timeZone: "UTC",
});

const priceFormSchema = z.object({
  groupType: z.string().min(1, requiredFieldMessage),
  amount: z
    .string()
    .min(1, requiredFieldMessage)
    .refine((value) => {
      const amount = Number(value);

      return Number.isInteger(amount) && amount > 0;
    }, "Ingresá un monto mayor a cero."),
  paymentDeadline: z.string().trim().min(1, requiredFieldMessage),
  scheduleId: z.string(),
});

type PriceFormValues = z.infer<typeof priceFormSchema>;
type PriceFormController = UseFormReturn<PriceFormValues>;

const emptyPriceFieldErrors: Record<string, string> = {};
const createPriceFormId = "create-price-form";

export function EventPricesRouteView({
  loaderData,
}: {
  loaderData: EventBasesLoaderData;
}) {
  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Precios"
      description="Revisá el alcance y el importe de cada precio del evento activo."
      action={{
        label: "Nuevo precio",
        to: buildPriceCreatePath(loaderData.selectedEventId),
      }}
    >
      {loaderData.prices.length > 0 ? (
        <PriceListTable
          prices={loaderData.prices}
          selectedEventId={loaderData.selectedEventId}
        />
      ) : (
        <AdminEmptyState
          title="Todavía no hay precios creados."
          description="Creá el primer precio para definir importes base o específicos por cronograma del evento activo."
        />
      )}
    </AdminResourceLayout>
  );
}

export function NewEventPriceRouteView({
  loaderData,
  actionData,
}: EventBaseAreaProps) {
  useServerActionToast(actionData);

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Nuevo precio"
      description="Configurá tipo de grupo, importe y si el precio aplica como base o para un cronograma específico."
    >
      <PriceScheduleAlert />
      <PriceFormPanel>
        <PriceForm
          formId={createPriceFormId}
          intent="create-price"
          schedules={loaderData.schedules}
          fieldErrors={actionData?.fieldErrors}
          submittedValues={getPriceSubmittedValues(actionData, "create-price")}
        />
        <PriceFormActions formId={createPriceFormId} submitLabel="Guardar" />
      </PriceFormPanel>
    </AdminResourceLayout>
  );
}

export function EventPriceDetailRouteView({
  loaderData,
  actionData,
  priceId,
}: EventBaseAreaProps & { priceId: string }) {
  useServerActionToast(actionData);

  const price = loaderData.prices.find((item) => item.id === priceId);

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title={price ? "Editar precio" : "Precio no encontrado"}
      description={
        price
          ? "Editá el alcance, importe y fecha límite de pago."
          : "No encontramos ese precio dentro del evento activo."
      }
      headerAction={price ? <PriceActions price={price} /> : null}
    >
      {price ? (
        <div className="flex flex-col gap-6">
          <PriceScheduleAlert />
          <PriceFormPanel>
            <PriceForm
              formId="update-price-form"
              id={price.id}
              intent="update-price"
              schedules={loaderData.schedules}
              groupType={price.groupType}
              amount={price.amount}
              paymentDeadline={price.paymentDeadline ?? ""}
              scheduleId={price.scheduleId}
              fieldErrors={actionData?.fieldErrors}
              submittedValues={getPriceSubmittedValues(
                actionData,
                "update-price",
                price.id,
              )}
            />
            <PriceFormActions
              formId="update-price-form"
              submitLabel="Guardar"
            />
          </PriceFormPanel>
        </div>
      ) : (
        <EmptyResourceState>
          No encontramos ese precio. Volvé a la lista para elegir otro registro.
        </EmptyResourceState>
      )}
    </AdminResourceLayout>
  );
}

export function buildPriceListPath(selectedEventId: string | null) {
  return appendSelectedEventId("/administracion/precios", selectedEventId);
}

export function buildPriceCreatePath(selectedEventId: string | null) {
  return appendSelectedEventId(
    "/administracion/precios/nuevo",
    selectedEventId,
  );
}

export function buildPriceDetailPath(
  priceId: string,
  selectedEventId: string | null,
) {
  return appendSelectedEventId(
    `/administracion/precios/${priceId}`,
    selectedEventId,
  );
}

export function isPriceDetailPath(requestUrl: string) {
  return new RegExp("^/administracion/precios/[^/]+$").test(
    new URL(requestUrl).pathname,
  );
}

function getPriceSubmittedValues(
  actionData: ActionData | undefined,
  intent: string,
  recordId?: string,
) {
  if (
    actionData?.scope?.intent !== intent ||
    actionData.scope.recordId !== recordId ||
    !isPriceActionValues(actionData.values)
  ) {
    return undefined;
  }

  return actionData.values;
}

function isPriceActionValues(
  values: ActionData["values"] | undefined,
): values is PriceActionValues {
  return (
    values !== undefined &&
    "groupType" in values &&
    "amount" in values &&
    "paymentDeadline" in values &&
    "scheduleId" in values
  );
}

function PriceForm({
  amount,
  fieldErrors = emptyPriceFieldErrors,
  formId,
  groupType,
  id,
  intent,
  paymentDeadline,
  scheduleId,
  schedules,
  submittedValues,
}: {
  amount?: number;
  fieldErrors?: Record<string, string>;
  formId?: string;
  groupType?: string;
  id?: string;
  intent: string;
  paymentDeadline?: string;
  scheduleId?: string | null;
  schedules: ScheduleListItem[];
  submittedValues?: PriceActionValues;
}) {
  const defaultValues = useMemo(
    () =>
      submittedValues
        ? {
            ...submittedValues,
            scheduleId: submittedValues.scheduleId || EMPTY_SCHEDULE_VALUE,
          }
        : {
            groupType: groupType ?? "",
            amount: amount ? String(amount) : "",
            paymentDeadline: paymentDeadline ?? "",
            scheduleId: scheduleId ?? EMPTY_SCHEDULE_VALUE,
          },
    [amount, groupType, paymentDeadline, scheduleId, submittedValues],
  );
  const form = useForm<PriceFormValues>({
    defaultValues,
    mode: "onSubmit",
    resolver: zodResolver(priceFormSchema),
  });

  useEffect(() => {
    form.reset(defaultValues);
  }, [defaultValues, form]);

  useApplyServerFieldErrors(form, fieldErrors);

  const selectedScheduleValue = form.watch("scheduleId");
  const priceScopeLabel =
    selectedScheduleValue === EMPTY_SCHEDULE_VALUE
      ? "Precio base"
      : "Precio por cronograma";

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const formElement = event.currentTarget;
    const submitNativeForm: SubmitHandler<PriceFormValues> = () => {
      formElement.submit();
    };

    void form.handleSubmit(submitNativeForm)(event);
  }

  return (
    <form
      id={formId}
      method="post"
      className="flex w-full flex-col gap-5"
      onSubmit={handleSubmit}
    >
      <input type="hidden" name="intent" value={intent} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <p className="text-sm font-medium">{priceScopeLabel}</p>
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <SelectField
          form={form}
          label="Tipo de grupo"
          name="groupType"
          options={groupTypeOptions}
          placeholder="Elegí un tipo"
        />
        <SelectField
          form={form}
          label="Cronograma"
          name="scheduleId"
          options={[
            {
              label: "Sin cronograma",
              value: EMPTY_SCHEDULE_VALUE,
            },
            ...schedules.map((schedule) => ({
              label: schedule.name,
              value: schedule.id,
            })),
          ]}
          placeholder="Sin cronograma"
          submitValue={(value) => (value === EMPTY_SCHEDULE_VALUE ? "" : value)}
        />
        <TextField
          form={form}
          label="Monto"
          min="1"
          name="amount"
          step="1"
          type="number"
        />
        <Controller
          control={form.control}
          name="paymentDeadline"
          render={({ field }) => (
            <DateOnlyField
              id={`price-payment-deadline-${id ?? intent}`}
              label="Fecha límite de pago"
              name="paymentDeadline"
              defaultValue={paymentDeadline ?? ""}
              value={field.value}
              onBlur={field.onBlur}
              onValueChange={field.onChange}
              error={form.formState.errors.paymentDeadline?.message}
            />
          )}
        />
      </FieldGroup>
    </form>
  );
}

function PriceScheduleAlert() {
  return (
    <Alert>
      <Info aria-hidden="true" />
      <AlertDescription>{PRICE_SCHEDULE_ALERT_TEXT}</AlertDescription>
    </Alert>
  );
}

function PriceFormActions({
  formId,
  submitLabel,
}: {
  formId: string;
  submitLabel: string;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button asChild variant="outline">
        <Link to={buildPriceListPath(null)}>Volver</Link>
      </Button>
      <Button type="submit" form={formId}>
        <Check data-icon="inline-start" />
        {submitLabel}
      </Button>
    </div>
  );
}

function PriceFormPanel({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-6">{children}</CardContent>
    </Card>
  );
}

function TextField({
  className,
  form,
  label,
  name,
  ...inputProps
}: {
  className?: string;
  form: PriceFormController;
  label: string;
  name: keyof PriceFormValues;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "form" | "name">) {
  const id = useId();
  const errorId = `${id}-error`;
  const error = form.formState.errors[name]?.message;

  return (
    <Field className={className} data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <Input
            id={id}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error ? true : undefined}
            autoComplete="off"
            {...inputProps}
            {...field}
          />
        )}
      />
      <FieldError id={errorId}>{error}</FieldError>
    </Field>
  );
}

function SelectField({
  className,
  form,
  label,
  name,
  options,
  placeholder,
  submitValue = (value) => value,
}: {
  className?: string;
  form: PriceFormController;
  label: string;
  name: keyof PriceFormValues;
  options: Array<{ label: string; value: string }>;
  placeholder: string;
  submitValue?: (value: string) => string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const error = form.formState.errors[name]?.message;

  return (
    <Field className={className} data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <>
            <input
              type="hidden"
              name={field.name}
              value={submitValue(field.value)}
            />
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger
                id={id}
                aria-describedby={error ? errorId : undefined}
                aria-invalid={error ? true : undefined}
                className="w-full"
                onBlur={field.onBlur}
              >
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </>
        )}
      />
      <FieldError id={errorId}>{error}</FieldError>
    </Field>
  );
}

function PriceListTable({
  prices,
  selectedEventId,
}: {
  prices: PriceListItem[];
  selectedEventId: string | null;
}) {
  const columns: DataTableColumn<PriceListItem>[] = [
    {
      id: "groupType",
      header: "Tipo de grupo",
      className: "min-w-56 font-medium",
      cell: (price) => (
        <Link
          to={buildPriceDetailPath(price.id, selectedEventId)}
          className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label={getPriceDisplayName(price)}
        >
          {getGroupTypeLabel(price.groupType)}
        </Link>
      ),
      filterValues: (price) => [price.groupType],
      filterValue: (price) => getGroupTypeLabel(price.groupType),
      sortValue: (price) => getGroupTypeLabel(price.groupType),
    },
    {
      id: "scope",
      header: "Cronograma",
      cell: (price) => (
        <div className="flex flex-col">
          <span className="text-muted-foreground">
            {getPriceScopeLabel(price)}
          </span>
          {price.schedule ? (
            <span className="text-muted-foreground">{price.schedule.name}</span>
          ) : null}
        </div>
      ),
      filterValue: (price) =>
        price.schedule
          ? `${getPriceScopeLabel(price)} ${price.schedule.name}`
          : getPriceScopeLabel(price),
    },
    {
      id: "paymentDeadline",
      header: "Fecha límite",
      cell: (price) => (
        <span className="text-muted-foreground">
          {formatPaymentDeadlineForTable(price.paymentDeadline)}
        </span>
      ),
      sortValue: (price) => price.paymentDeadline ?? "",
    },
    {
      id: "amount",
      header: "Importe",
      cell: (price) => formatAmount(price.amount),
    },
  ];

  return (
    <DataTable
      mode="client"
      rows={prices}
      columns={columns}
      getRowKey={(price) => price.id}
      searchPlaceholder="Buscar precio por cronograma"
      textFilterColumnId="scope"
      facetedFilters={[
        {
          columnId: "groupType",
          label: "Filtros",
          groups: [
            {
              label: "Tipo de grupo",
              options: groupTypeOptions,
            },
          ],
        },
      ]}
      emptyMessage="No hay precios que coincidan con la búsqueda."
    />
  );
}

function getGroupTypeLabel(groupType: string) {
  return groupTypeLabels[groupType] ?? groupType;
}

export function getPriceDisplayName(price: PriceListItem) {
  const groupTypeLabel = getGroupTypeLabel(price.groupType);
  const scopeLabel = price.schedule?.name ?? getPriceScopeLabel(price);
  const deadlineLabel = formatPaymentDeadlineForDisplay(price.paymentDeadline);

  return deadlineLabel
    ? `${groupTypeLabel} - ${scopeLabel} - hasta ${deadlineLabel}`
    : `${groupTypeLabel} - ${scopeLabel}`;
}

function getPriceScopeLabel(price: PriceListItem) {
  return price.schedule ? "Precio por cronograma" : "Precio base";
}

function formatPaymentDeadlineForDisplay(paymentDeadline: string | null) {
  if (!paymentDeadline) {
    return "";
  }

  return priceDateFormatter.format(new Date(`${paymentDeadline}T00:00:00Z`));
}

function formatPaymentDeadlineForTable(paymentDeadline: string | null) {
  return formatPaymentDeadlineForDisplay(paymentDeadline);
}

function formatAmount(amount: number) {
  return `$${amount}`;
}

function PriceActions({ price }: { price: PriceListItem }) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

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
            onSelect={() => setDeleteDialogOpen(true)}
          >
            Borrar precio
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </ResourceActionsMenu>
      <DeletePriceDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        price={price}
      />
    </>
  );
}

function DeletePriceDialog({
  open,
  onOpenChange,
  price,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  price: PriceListItem;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar precio</DialogTitle>
          <DialogDescription>
            Esta acción borra {getPriceDisplayName(price)} si no tiene
            dependencias asociadas. No se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </DialogClose>
          <form method="post">
            <input type="hidden" name="intent" value="delete-price" />
            <input type="hidden" name="id" value={price.id} />
            <input type="hidden" name="confirmDeletion" value={price.id} />
            <Button type="submit" variant="destructive">
              <Trash data-icon="inline-start" />
              Eliminar
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyResourceState({ children }: { children: ReactNode }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>Sin datos</EmptyTitle>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function appendSelectedEventId(
  pathname: string,
  _selectedEventId: string | null,
) {
  return pathname;
}
