import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Plus } from "lucide-react";
import { useEffect, useId, useState, type ComponentProps } from "react";
import { Controller, useForm, type Control } from "react-hook-form";
import { Link, redirect, useFetcher } from "react-router";
import { z } from "zod";

import { DateOnlyField } from "@/components/shared/date-only-field";
import {
  PortalEmptyState,
  PortalListPage,
  type PortalRouteHandle,
} from "@/components/portal/ui";
import { ButtonPendingContent } from "@/components/shared/button-pending-content";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import {
  createDancerForAcademy,
  listDancersForAcademy,
  type CreateDancerInput,
  type DancerListItem,
} from "@/lib/portal/dancers.server";
import { getPortalActiveEventSummaryContext } from "@/lib/portal/event-context.server";
import {
  createValidatedReactRouterSubmitHandler,
  type ReactRouterFormSubmit,
  requiredFieldMessage,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";

type LoaderData = Awaited<ReturnType<typeof loader>>;
type ActionData = Awaited<ReturnType<typeof action>>;
type DancerRow = LoaderData["dancers"][number];

const createDancerSchema = z.object({
  firstName: z.string().trim().min(1, requiredFieldMessage),
  lastName: z.string().trim().min(1, requiredFieldMessage),
  birthDate: z.string().trim().min(1, requiredFieldMessage),
});

type CreateDancerFormValues = z.infer<typeof createDancerSchema>;

const emptyDancerValues: CreateDancerFormValues = {
  firstName: "",
  lastName: "",
  birthDate: "",
};

const emptyDancerFieldErrors: Partial<
  Record<keyof CreateDancerFormValues, string>
> = {};

const baseDancerFilters = {
  status: {
    archivo: "active",
  },
};

const createDancerIntent = "create-dancer";
const createDancerSuccessRedirect =
  "/portal/bailarines?notificacion=bailarin-creado";

type DancerBadge = {
  label: string;
  variant: ComponentProps<typeof Badge>["variant"];
};

export const meta = () => [
  { title: "Bailarines | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [{ label: "Bailarines" }],
} satisfies PortalRouteHandle;

export async function loader({ request }: { request: Request }) {
  const { academy } = await requireAcademyUser(request);
  const eventContext = await getPortalActiveEventSummaryContext(request);
  const dancers = await listDancersForAcademy(academy.id, {
    selectedEventId: eventContext.activeEvent?.id ?? null,
    status: "all",
  });

  return {
    dancers,
  };
}

export async function action({ request }: { request: Request }) {
  const { academy } = await requireAcademyUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent !== createDancerIntent) {
    throw new Response("Acción no soportada.", { status: 400 });
  }

  const values = {
    firstName: formValue(formData, "firstName"),
    lastName: formValue(formData, "lastName"),
    birthDate: formValue(formData, "birthDate"),
  };
  const parsed = createDancerSchema.safeParse(values);

  if (!parsed.success) {
    return {
      status: "error" as const,
      fieldErrors: getCreateDancerFieldErrors(parsed.error),
      values,
      modalOpen: true,
    };
  }

  const result = await createDancerForAcademy(academy.id, parsed.data);

  if (!result.ok) {
    return {
      status: "error" as const,
      fieldErrors: result.fieldErrors,
      values: result.values,
      modalOpen: true,
    };
  }

  throw redirect(createDancerSuccessRedirect);
}

export function PortalBailarinesRouteView({
  loaderData,
  actionData: providedActionData,
}: {
  loaderData: LoaderData;
  actionData?: ActionData;
}) {
  const createDancerFetcher = useFetcher<typeof action>();
  const actionData =
    createDancerFetcher.data?.status === "error"
      ? createDancerFetcher.data
      : providedActionData;
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(
    actionData?.modalOpen === true,
  );
  const [dismissServerState, setDismissServerState] = useState(false);
  const [dialogResetKey, setDialogResetKey] = useState(0);

  useEffect(() => {
    if (actionData?.modalOpen === true) {
      setIsCreateDialogOpen(true);
      setDismissServerState(false);
    }
  }, [actionData]);

  const visibleActionData = dismissServerState ? undefined : actionData;

  return (
    <>
      <PortalListPage
        titleId="bailarines-title"
        title="Bailarines"
        description="Gestioná los bailarines de tu academia y priorizá los registros que todavía necesitan documento o imágenes."
        action={
          <Button
            type="button"
            onClick={() => {
              setDismissServerState(true);
              setIsCreateDialogOpen(true);
            }}
          >
            <Plus aria-hidden="true" data-icon />
            Nuevo bailarín
          </Button>
        }
      >
        {loaderData.dancers.length > 0 ? (
          <DancersTable dancers={loaderData.dancers} />
        ) : (
          <PortalEmptyState
            title="Todavía no cargaste bailarines"
            description="Cuando cargues bailarines, van a aparecer en esta lista para usarlos en coreografías."
          />
        )}
      </PortalListPage>

      <CreateDancerDialog
        key={dialogResetKey}
        actionData={visibleActionData}
        isOpen={isCreateDialogOpen}
        isSubmitting={createDancerFetcher.state !== "idle"}
        onOpenChange={(nextOpen) => {
          setIsCreateDialogOpen(nextOpen);

          if (!nextOpen) {
            setDismissServerState(true);
            setDialogResetKey((currentValue) => currentValue + 1);
          }
        }}
        submit={createDancerFetcher.submit}
      />
    </>
  );
}

export default function PortalBailarinesRoute({
  loaderData,
}: {
  loaderData: LoaderData;
}) {
  return <PortalBailarinesRouteView loaderData={loaderData} />;
}

function DancersTable({ dancers }: { dancers: DancerRow[] }) {
  const columns: DataTableColumn<DancerRow>[] = [
    {
      id: "name",
      header: "Nombre",
      className: "w-1/2 font-medium",
      headerClassName: "w-1/2",
      cell: (dancer) => (
        <Link
          to={`/portal/bailarines/${dancer.id}`}
          className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {dancer.firstName} {dancer.lastName}
        </Link>
      ),
      filterValue: (dancer) =>
        `${dancer.firstName} ${dancer.lastName} ${dancer.documentNumber ?? ""}`,
      sortValue: (dancer) => `${dancer.firstName} ${dancer.lastName}`,
    },
    {
      id: "document",
      header: "Documento",
      className: "w-1/4 text-muted-foreground",
      headerClassName: "w-1/4",
      cell: (dancer) => formatDocument(dancer),
      filterValue: (dancer) => dancer.documentNumber ?? "",
    },
    {
      id: "status",
      header: "Estado",
      className: "w-1/4",
      headerClassName: "w-1/4",
      cell: (dancer) => (
        <div className="flex flex-wrap gap-2">
          {getDancerStateBadges(dancer).map((badge) => (
            <Badge key={badge.label} variant={badge.variant}>
              {badge.label}
            </Badge>
          ))}
        </div>
      ),
      filterValues: (dancer) => [
        dancer.active ? "active" : "archived",
        dancer.participationStatus,
        dancer.verificationStatus,
      ],
    },
  ];

  return (
    <DataTable
      mode="client"
      rows={dancers}
      columns={columns}
      getRowKey={(dancer) => dancer.id}
      searchPlaceholder="Buscar bailarín por nombre o número de documento"
      textFilterColumnId="name"
      facetedFilters={[
        {
          columnId: "status",
          label: "Filtros",
          groups: [
            {
              label: "Participación",
              options: [
                { label: "Participando", value: "participating" },
                { label: "No participando", value: "not-participating" },
              ],
            },
            {
              label: "Verificación",
              options: [
                { label: "Incompleto", value: "incomplete" },
                { label: "Faltan imágenes", value: "missingImages" },
                { label: "Sin verificar", value: "unverified" },
                { label: "Verificado", value: "verified" },
              ],
            },
            {
              id: "archivo",
              label: "Archivo",
              options: [{ label: "Archivado", value: "archived" }],
            },
          ],
        },
      ]}
      baseFacetedFilterValues={baseDancerFilters}
      emptyMessage="No hay bailarines que coincidan con la búsqueda o los filtros."
      initialSort={{ columnId: "name", direction: "asc" }}
    />
  );
}

function CreateDancerDialog({
  actionData,
  isOpen,
  isSubmitting,
  onOpenChange,
  submit,
}: {
  actionData?: ActionData;
  isOpen: boolean;
  isSubmitting: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  submit: ReactRouterFormSubmit;
}) {
  const firstNameId = useId();
  const lastNameId = useId();
  const birthDateId = useId();
  const form = useForm<CreateDancerFormValues>({
    resolver: zodResolver(createDancerSchema),
    defaultValues: actionData?.values ?? emptyDancerValues,
  });
  const serverFieldErrors = actionData?.fieldErrors ?? emptyDancerFieldErrors;

  useEffect(() => {
    form.reset(actionData?.values ?? emptyDancerValues);
  }, [actionData?.values, form]);

  useApplyServerFieldErrors(form, serverFieldErrors);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Nuevo bailarín</DialogTitle>
          <DialogDescription>
            Ingresá los datos mínimos para cargarlo en la academia.
          </DialogDescription>
        </DialogHeader>

        <form
          method="post"
          onSubmit={createValidatedReactRouterSubmitHandler(form, submit, {
            method: "post",
          })}
          className="flex flex-col gap-5"
        >
          <input type="hidden" name="intent" value={createDancerIntent} />
          <FieldGroup>
            <DancerTextField
              control={form.control}
              fieldName="firstName"
              id={firstNameId}
              label="Nombre"
              autoComplete="given-name"
              serverError={serverFieldErrors.firstName}
            />

            <DancerTextField
              control={form.control}
              fieldName="lastName"
              id={lastNameId}
              label="Apellido"
              autoComplete="family-name"
              serverError={serverFieldErrors.lastName}
            />

            <Controller
              control={form.control}
              name="birthDate"
              render={({ field, fieldState }) => {
                const errorMessage =
                  fieldState.error?.message ?? serverFieldErrors.birthDate;

                return (
                  <DateOnlyField
                    id={birthDateId}
                    label="Fecha de nacimiento"
                    name={field.name}
                    defaultValue={field.value}
                    value={field.value}
                    onBlur={field.onBlur}
                    onValueChange={field.onChange}
                    error={errorMessage}
                    endMonth={new Date()}
                    startMonth={new Date(1900, 0)}
                  />
                );
              }}
            />
          </FieldGroup>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              <ButtonPendingContent
                isPending={isSubmitting}
                pendingLabel="Guardando..."
                idleLabel="Guardar"
                idleIcon={<Check aria-hidden="true" data-icon />}
              />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DancerTextField({
  autoComplete,
  control,
  fieldName,
  id,
  label,
  serverError,
}: {
  autoComplete: string;
  control: Control<CreateDancerFormValues>;
  fieldName: keyof CreateDancerFormValues;
  id: string;
  label: string;
  serverError?: string;
}) {
  return (
    <Controller
      control={control}
      name={fieldName}
      render={({ field, fieldState }) => {
        const errorMessage = fieldState.error?.message ?? serverError;
        const isInvalid = Boolean(errorMessage);

        return (
          <Field data-invalid={isInvalid ? true : undefined}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <FieldContent>
              <Input
                {...field}
                id={id}
                autoComplete={autoComplete}
                aria-invalid={isInvalid ? true : undefined}
              />
              <FieldError>{errorMessage}</FieldError>
            </FieldContent>
          </Field>
        );
      }}
    />
  );
}

function getDancerStateBadges(dancer: DancerRow) {
  const badges: DancerBadge[] = [];

  if (!dancer.active) {
    badges.push({ label: "Archivado", variant: "outline" });
  }

  badges.push({
    label: getDancerParticipationLabel(dancer.participationStatus),
    variant:
      dancer.participationStatus === "participating" ? "outline" : "secondary",
  });

  badges.push({
    label: getDancerVerificationLabel(dancer.verificationStatus),
    variant: dancer.verificationStatus === "verified" ? "default" : "secondary",
  });

  return badges;
}

function getDancerParticipationLabel(
  status: DancerListItem["participationStatus"],
) {
  if (status === "participating") {
    return "Participando";
  }

  return "No participando";
}

function getDancerVerificationLabel(
  status: DancerListItem["verificationStatus"],
) {
  switch (status) {
    case "verified":
      return "Verificado";
    case "unverified":
      return "Sin verificar";
    case "missingImages":
      return "Faltan imágenes";
    case "incomplete":
      return "Incompleto";
  }
}

function formatDocument(dancer: DancerRow) {
  if (!dancer.documentType || !dancer.documentNumber) {
    return <span className="text-muted-foreground">Sin documento</span>;
  }

  switch (dancer.documentType) {
    case "dni":
      return `DNI ${dancer.documentNumber}`;
    case "passport":
      return `Pasaporte ${dancer.documentNumber}`;
    default:
      return `Otro ${dancer.documentNumber}`;
  }
}

function formValue(formData: FormData, fieldName: keyof CreateDancerInput) {
  const value = formData.get(fieldName);

  return typeof value === "string" ? value : "";
}

function getCreateDancerFieldErrors(error: z.ZodError<CreateDancerFormValues>) {
  const fieldErrors = error.flatten().fieldErrors;

  return {
    firstName: fieldErrors.firstName?.[0],
    lastName: fieldErrors.lastName?.[0],
    birthDate: fieldErrors.birthDate?.[0],
  };
}
