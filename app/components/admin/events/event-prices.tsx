import { Link } from "react-router";
import { Save } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useMemo } from "react";
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
  buildEventBasePath,
} from "@/components/admin/resource-layout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  PriceListItem,
  ScheduleBlockListItem,
} from "@/lib/events/bases.server";
import type { ActionData } from "@/lib/admin/events/bases-action.server";
import { groupTypeLabels, groupTypeOptions } from "@/lib/events/group-types";
import type { EventBasesLoaderData } from "@/lib/admin/events/bases-route.server";
import {
  requiredFieldMessage,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

type PriceScope = {
  detail: string | null;
  label: string;
};

type EventBaseAreaProps = {
  loaderData: EventBasesLoaderData;
  actionData?: ActionData;
};

const PRICE_BASE_HELPER_TEXT =
  "El precio base aplica cuando no existe un precio específico para el bloque horario.";
const PRICE_BASE_SCHEDULE_BLOCK_VALUE = "__price-base__";

const priceFormSchema = z.object({
  name: z.string().trim().min(1, requiredFieldMessage),
  groupType: z.string().min(1, requiredFieldMessage),
  amount: z
    .string()
    .min(1, requiredFieldMessage)
    .refine((value) => {
      const amount = Number(value);

      return Number.isInteger(amount) && amount > 0;
    }, "Ingresá un monto mayor a cero."),
  scheduleBlockId: z.string(),
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
      loaderData={loaderData}
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
          description="Creá el primer precio para definir importes base o específicos por bloque horario del evento activo."
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
      loaderData={loaderData}
      breadcrumbItems={[
        {
          label: "Precios",
          to: buildEventBasePath("precios", loaderData.selectedEventId),
        },
        { label: "Nuevo precio" },
      ]}
      title="Nuevo precio"
      description="Configurá nombre, tipo de grupo, importe y si el precio aplica como base o para un bloque horario específico."
    >
      <PriceFormPanel>
        <PriceForm
          formId={createPriceFormId}
          intent="create-price"
          scheduleBlocks={loaderData.scheduleBlocks}
          fieldErrors={actionData?.fieldErrors}
          helperText={PRICE_BASE_HELPER_TEXT}
        />
      </PriceFormPanel>
      <PriceFormActions formId={createPriceFormId} submitLabel="Guardar" />
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
      loaderData={loaderData}
      breadcrumbItems={[
        {
          label: "Precios",
          to: buildEventBasePath("precios", loaderData.selectedEventId),
        },
        { label: price?.name ?? "Precio" },
      ]}
      title={price?.name ?? "Precio no encontrado"}
      description={
        price
          ? "Editá el alcance y el importe del precio. El borrado solo está disponible desde esta pantalla."
          : "No encontramos ese precio dentro del evento activo."
      }
    >
      {price ? (
        <div className="flex flex-col gap-6">
          <ResourceSection title="Resumen">
            <PriceSummaryCard price={price} />
          </ResourceSection>
          <ResourceSection title="Editar precio">
            <PriceForm
              id={price.id}
              intent="update-price"
              scheduleBlocks={loaderData.scheduleBlocks}
              name={price.name}
              groupType={price.groupType}
              amount={price.amount}
              scheduleBlockId={price.scheduleBlockId}
              buttonLabel="Guardar"
              fieldErrors={actionData?.fieldErrors}
              helperText={PRICE_BASE_HELPER_TEXT}
            />
          </ResourceSection>
          <ResourceSection title="Eliminar precio">
            <PriceDeleteForm priceId={price.id} />
          </ResourceSection>
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

function PriceForm({
  amount,
  buttonLabel,
  fieldErrors = emptyPriceFieldErrors,
  formId,
  groupType,
  helperText,
  id,
  intent,
  name,
  scheduleBlockId,
  scheduleBlocks,
}: {
  amount?: number;
  buttonLabel?: string;
  fieldErrors?: Record<string, string>;
  formId?: string;
  groupType?: string;
  helperText?: string;
  id?: string;
  intent: string;
  name?: string;
  scheduleBlockId?: string | null;
  scheduleBlocks: ScheduleBlockListItem[];
}) {
  const defaultValues = useMemo(
    () => ({
      name: name ?? "",
      groupType: groupType ?? "",
      amount: amount ? String(amount) : "",
      scheduleBlockId: scheduleBlockId ?? PRICE_BASE_SCHEDULE_BLOCK_VALUE,
    }),
    [amount, groupType, name, scheduleBlockId],
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
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <TextField
          className="sm:col-span-2"
          form={form}
          label="Nombre del precio"
          name="name"
        />
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
        <SelectField
          className="sm:col-span-2"
          form={form}
          label="Bloque horario opcional"
          name="scheduleBlockId"
          options={[
            {
              label: "Precio general",
              value: PRICE_BASE_SCHEDULE_BLOCK_VALUE,
            },
            ...scheduleBlocks.map((scheduleBlock) => ({
              label: scheduleBlock.name,
              value: scheduleBlock.id,
            })),
          ]}
          placeholder="Precio general"
          submitValue={(value) =>
            value === PRICE_BASE_SCHEDULE_BLOCK_VALUE ? "" : value
          }
        />
        {helperText ? (
          <FieldDescription className="sm:col-span-2">
            {helperText}
          </FieldDescription>
        ) : null}
        {buttonLabel ? (
          <div className="sm:col-span-2">
            <Button type="submit">{buttonLabel}</Button>
          </div>
        ) : null}
      </FieldGroup>
    </form>
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
    <div className="flex items-center justify-between">
      <Button asChild variant="outline">
        <Link to={buildPriceListPath(null)}>Volver</Link>
      </Button>
      <Button type="submit" form={formId}>
        <Save data-icon="inline-start" />
        {submitLabel}
      </Button>
    </div>
  );
}

function PriceFormPanel({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardContent>{children}</CardContent>
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

function PriceSummaryCard({ price }: { price: PriceListItem }) {
  const scope = getPriceScope(price);

  return (
    <Card>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          <PriceDetailItem label="Nombre" value={price.name} />
          <PriceDetailItem
            label="Tipo de grupo"
            value={groupTypeLabels[price.groupType] ?? price.groupType}
          />
          <PriceDetailItem label="Alcance" value={scope.label} />
          <PriceDetailItem label="Importe" value={`$${price.amount}`} />
          <PriceDetailItem
            label="Bloque horario"
            value={scope.detail ?? "Sin bloque horario específico"}
          />
        </dl>
      </CardContent>
    </Card>
  );
}

function PriceDetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}

function PriceListTable({
  prices,
  selectedEventId,
}: {
  prices: PriceListItem[];
  selectedEventId: string | null;
}) {
  return (
    <Card>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Nombre</TableHead>
              <TableHead scope="col">Tipo de grupo</TableHead>
              <TableHead scope="col">Alcance</TableHead>
              <TableHead scope="col">Importe</TableHead>
              <TableHead scope="col">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prices.map((price) => {
              const scope = getPriceScope(price);

              return (
                <TableRow key={price.id}>
                  <TableCell className="font-medium">{price.name}</TableCell>
                  <TableCell>
                    {groupTypeLabels[price.groupType] ?? price.groupType}
                  </TableCell>
                  <TableCell>
                    <p>{scope.label}</p>
                    {scope.detail ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {scope.detail}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>${price.amount}</TableCell>
                  <TableCell>
                    <Button asChild variant="outline">
                      <Link
                        to={buildPriceDetailPath(price.id, selectedEventId)}
                      >
                        Ver detalle
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function PriceDeleteForm({ priceId }: { priceId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Eliminar precio</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm leading-6 text-muted-foreground">
          Esta acción elimina el precio si no tiene dependencias asociadas.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button className="w-fit" variant="destructive">
              Borrar precio
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Borrar este precio?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. Si el precio tiene
                dependencias asociadas, el sistema va a impedir el borrado.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <form method="post">
                <input type="hidden" name="intent" value="delete-price" />
                <input type="hidden" name="id" value={priceId} />
                <input type="hidden" name="confirmDeletion" value={priceId} />
                <AlertDialogAction asChild variant="destructive">
                  <button type="submit">Borrar precio</button>
                </AlertDialogAction>
              </form>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

function ResourceSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold">{title}</h3>
      {children}
    </section>
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

function getPriceScope(price: PriceListItem): PriceScope {
  if (price.scheduleBlock) {
    return {
      label: "Precio por bloque horario",
      detail: price.scheduleBlock.name,
    };
  }

  return {
    label: "Precio base",
    detail: null,
  };
}
