import { Link } from "react-router";
import { Check, LoaderCircle, Trash } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";
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
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  createValidatedRouteSubmitHandler,
  isRouteFormPending,
  requiredFieldMessage,
  type RouteFormPendingScope,
  useApplyServerFieldErrors,
  useOptionalFormAction,
  useOptionalNavigation,
  useOptionalSubmit,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

type EventBaseAreaProps = {
  loaderData: EventBasesLoaderData;
  actionData?: ActionData;
};

const EMPTY_SCHEDULE_VALUE = "__empty_schedule__";
const priceDateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "numeric",
  year: "2-digit",
  timeZone: "UTC",
});
const priceTableDateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const priceFormSchema = z
  .object({
    name: z.string().trim().min(1, requiredFieldMessage),
    isSpecialPrice: z.boolean(),
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
  })
  .superRefine((values, context) => {
    if (
      values.isSpecialPrice &&
      values.scheduleId.trim() === EMPTY_SCHEDULE_VALUE
    ) {
      context.addIssue({
        code: "custom",
        message: requiredFieldMessage,
        path: ["scheduleId"],
      });
    }
  });

type PriceFormValues = z.infer<typeof priceFormSchema>;
type PriceTextFieldName = "amount";
type PriceSelectFieldName = "groupType" | "scheduleId";
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
      <PriceFormPanel>
        <PriceForm
          formId={createPriceFormId}
          intent="create-price"
          schedules={loaderData.schedules}
          fieldErrors={actionData?.fieldErrors}
          submittedValues={getPriceSubmittedValues(actionData, "create-price")}
        />
        <PriceFormActions
          formId={createPriceFormId}
          pendingLabel="Guardando precio..."
          pendingScope={{ intent: "create-price" }}
          submitLabel="Guardar"
        />
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
          <PriceFormPanel>
            <PriceForm
              formId="update-price-form"
              id={price.id}
              intent="update-price"
              schedules={loaderData.schedules}
              name={price.name}
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
              pendingLabel="Guardando precio..."
              pendingScope={{
                intent: "update-price",
                fields: { id: price.id },
              }}
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
    "name" in values &&
    "isSpecialPrice" in values &&
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
  name,
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
  name?: string | null;
  paymentDeadline?: string;
  scheduleId?: string | null;
  schedules: ScheduleListItem[];
  submittedValues?: PriceActionValues;
}) {
  const defaultValues = useMemo(
    () =>
      submittedValues
        ? {
            name: submittedValues.name,
            isSpecialPrice:
              submittedValues.isSpecialPrice === "true" ||
              submittedValues.scheduleId.length > 0,
            groupType: submittedValues.groupType,
            amount: submittedValues.amount,
            paymentDeadline: submittedValues.paymentDeadline,
            scheduleId: submittedValues.scheduleId || EMPTY_SCHEDULE_VALUE,
          }
        : {
            name: name ?? "",
            isSpecialPrice: Boolean(scheduleId),
            groupType: groupType ?? "",
            amount: amount ? String(amount) : "",
            paymentDeadline: paymentDeadline ?? "",
            scheduleId: scheduleId ?? EMPTY_SCHEDULE_VALUE,
          },
    [amount, groupType, name, paymentDeadline, scheduleId, submittedValues],
  );
  const form = useForm<PriceFormValues>({
    defaultValues,
    mode: "onSubmit",
    resolver: zodResolver(priceFormSchema),
  });
  const formAction = useOptionalFormAction();
  const submit = useOptionalSubmit();

  useEffect(() => {
    form.reset(defaultValues);
  }, [defaultValues, form]);

  useApplyServerFieldErrors(form, fieldErrors);

  const isSpecialPrice = form.watch("isSpecialPrice");

  return (
    <form
      id={formId}
      method="post"
      className="flex w-full flex-col gap-5"
      onSubmit={createValidatedRouteSubmitHandler(form, submit, formAction)}
    >
      <input type="hidden" name="intent" value={intent} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <FieldGroup>
        <NameField form={form} />
        {isSpecialPrice ? (
          <SelectField
            form={form}
            label="Cronograma"
            name="scheduleId"
            options={schedules.map((schedule) => ({
              label: schedule.name,
              value: schedule.id,
            }))}
            placeholder="Elegí un cronograma"
          />
        ) : (
          <input type="hidden" name="scheduleId" value="" />
        )}
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
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <SelectField
            form={form}
            label="Tipo de grupo"
            name="groupType"
            options={groupTypeOptions}
            placeholder="Elegí un tipo"
          />
          <TextField
            form={form}
            label="Monto"
            min="1"
            name="amount"
            step="1"
            type="number"
          />
        </FieldGroup>
      </FieldGroup>
    </form>
  );
}

function PriceFormActions({
  formId,
  pendingScope,
  pendingLabel,
  submitLabel,
}: {
  formId: string;
  pendingScope: RouteFormPendingScope;
  pendingLabel: string;
  submitLabel: string;
}) {
  const navigation = useOptionalNavigation();
  const isPending = isRouteFormPending(navigation, pendingScope);

  return (
    <div className="flex justify-end gap-2">
      <Button asChild variant="outline">
        <Link to={buildPriceListPath(null)}>Volver</Link>
      </Button>
      <Button type="submit" form={formId} disabled={isPending}>
        {isPending ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" data-icon />
        ) : (
          <Check aria-hidden="true" data-icon="inline-start" />
        )}
        {isPending ? pendingLabel : submitLabel}
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

function NameField({ form }: { form: PriceFormController }) {
  const id = useId();
  const errorId = `${id}-error`;
  const error = form.formState.errors.name?.message;

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>Nombre</FieldLabel>
      <Controller
        control={form.control}
        name="name"
        render={({ field }) => (
          <div className="relative">
            <Input
              id={id}
              aria-describedby={error ? errorId : undefined}
              aria-invalid={error ? true : undefined}
              autoComplete="off"
              className="pr-14"
              {...field}
            />
            <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center">
              <SpecialPriceSwitch form={form} />
            </div>
          </div>
        )}
      />
      <FieldError id={errorId}>{error}</FieldError>
    </Field>
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
  name: PriceTextFieldName;
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

function SpecialPriceSwitch({ form }: { form: PriceFormController }) {
  const id = useId();

  return (
    <Controller
      control={form.control}
      name="isSpecialPrice"
      render={({ field }) => (
        <>
          <input
            type="hidden"
            name={field.name}
            value={field.value ? "true" : "false"}
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Switch
                  id={id}
                  aria-label="Precio especial"
                  className={`border-border shadow-xs ${
                    field.value ? "!bg-primary" : "!bg-muted"
                  }`}
                  checked={field.value}
                  onBlur={field.onBlur}
                  onCheckedChange={(checked) => {
                    field.onChange(checked);

                    if (!checked) {
                      form.setValue("scheduleId", EMPTY_SCHEDULE_VALUE, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }
                  }}
                />
              </TooltipTrigger>
              <TooltipContent>Precio especial</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </>
      )}
    />
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
  name: PriceSelectFieldName;
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
      id: "name",
      header: "Nombre",
      className: "min-w-56 font-medium",
      cell: (price) => (
        <Link
          to={buildPriceDetailPath(price.id, selectedEventId)}
          className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label={getPriceDisplayName(price)}
        >
          {getPriceName(price)}
        </Link>
      ),
      filterValue: getPriceName,
    },
    {
      id: "groupType",
      header: "Tipo de grupo",
      cell: (price) => (
        <Badge variant="secondary">{getGroupTypeLabel(price.groupType)}</Badge>
      ),
      filterValues: (price) => [price.groupType],
      filterValue: (price) => getGroupTypeLabel(price.groupType),
    },
    {
      id: "filters",
      header: "Filtros",
      cell: () => null,
      hidden: true,
      filterValues: (price) => [price.groupType, price.schedule ? "yes" : "no"],
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
      searchPlaceholder="Buscar precio por nombre"
      textFilterColumnId="name"
      facetedFilters={[
        {
          columnId: "filters",
          label: "Filtros",
          groups: [
            {
              label: "Tipo de grupo",
              options: groupTypeOptions,
            },
            {
              label: "Cronograma",
              options: [
                { label: "Sí", value: "yes" },
                { label: "No", value: "no" },
              ],
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
  if (price.name) {
    return price.name;
  }

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

function getPriceName(price: PriceListItem) {
  return price.name ?? getPriceDisplayName(price);
}

function formatPaymentDeadlineForDisplay(paymentDeadline: string | null) {
  if (!paymentDeadline) {
    return "";
  }

  return priceDateFormatter.format(new Date(`${paymentDeadline}T00:00:00Z`));
}

function formatPaymentDeadlineForTable(paymentDeadline: string | null) {
  if (!paymentDeadline) {
    return "";
  }

  return priceTableDateFormatter.format(
    new Date(`${paymentDeadline}T00:00:00Z`),
  );
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
