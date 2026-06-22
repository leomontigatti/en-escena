import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Plus } from "lucide-react";
import { useEffect, useId, useState, type ComponentProps } from "react";
import { Controller, useForm, type Control } from "react-hook-form";
import {
  Link,
  redirect,
  useFetcher,
  useViewTransitionState,
} from "react-router";
import { z } from "zod";

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
  createAcademyProfessor,
  listAcademyProfessors,
  type CreateProfessorInput,
} from "@/lib/portal/professors.server";
import { getPortalActiveEventSummaryContext } from "@/lib/portal/event-context.server";
import {
  createValidatedReactRouterSubmitHandler,
  type ReactRouterFormSubmit,
  requiredFieldMessage,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";
import { getPortalRecordTitleViewTransitionStyle } from "@/lib/shared/view-transitions";

type LoaderData = Awaited<ReturnType<typeof loader>>;
type ActionData = Awaited<ReturnType<typeof action>>;
type ProfessorRow = LoaderData["professors"][number];
type ProfessorBadge = {
  label: string;
  variant: ComponentProps<typeof Badge>["variant"];
};

const createProfessorSchema = z.object({
  firstName: z.string().trim().min(1, requiredFieldMessage),
  lastName: z.string().trim().min(1, requiredFieldMessage),
});

type CreateProfessorFormValues = z.infer<typeof createProfessorSchema>;

const emptyProfessorValues: CreateProfessorFormValues = {
  firstName: "",
  lastName: "",
};

const emptyProfessorFieldErrors: Partial<
  Record<keyof CreateProfessorFormValues, string>
> = {};

const baseProfessorFilters = {
  status: {
    archivo: "active",
  },
};

export const meta = () => [
  { title: "Profesores | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [{ label: "Profesores" }],
} satisfies PortalRouteHandle;

export async function loader({ request }: { request: Request }) {
  const { academy } = await requireAcademyUser(request);
  const eventContext = await getPortalActiveEventSummaryContext(request);
  const professors = await listAcademyProfessors(academy.id, {
    selectedEventId: eventContext.activeEvent?.id ?? null,
  });

  return {
    professors,
  };
}

export async function action({ request }: { request: Request }) {
  const { academy } = await requireAcademyUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent !== "create-professor") {
    throw new Response("Acción no soportada.", { status: 400 });
  }

  const values = {
    firstName: formValue(formData, "firstName"),
    lastName: formValue(formData, "lastName"),
  };
  const parsed = createProfessorSchema.safeParse(values);

  if (!parsed.success) {
    return {
      status: "error" as const,
      fieldErrors: {
        firstName: parsed.error.flatten().fieldErrors.firstName?.[0],
        lastName: parsed.error.flatten().fieldErrors.lastName?.[0],
      },
      values,
      modalOpen: true,
    };
  }

  const result = await createAcademyProfessor(academy.id, parsed.data);

  if (!result.ok) {
    return {
      status: "error" as const,
      fieldErrors: result.fieldErrors,
      values: result.values,
      modalOpen: true,
    };
  }

  throw redirect("/portal/profesores?notificacion=profesor-creado");
}

export function PortalProfesoresRouteView({
  loaderData,
  actionData: providedActionData,
}: {
  loaderData: LoaderData;
  actionData?: ActionData;
}) {
  const createProfessorFetcher = useFetcher<typeof action>();
  const actionData =
    createProfessorFetcher.data?.status === "error"
      ? createProfessorFetcher.data
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
        titleId="profesores-title"
        title="Profesores"
        description="Gestioná los profesores de tu academia y completá su identificación cuando tengas los datos."
        action={
          <Button
            type="button"
            onClick={() => {
              setDismissServerState(true);
              setIsCreateDialogOpen(true);
            }}
          >
            <Plus aria-hidden="true" data-icon />
            Nuevo profesor
          </Button>
        }
      >
        {loaderData.professors.length > 0 ? (
          <ProfessorsTable professors={loaderData.professors} />
        ) : (
          <PortalEmptyState
            title="Todavía no cargaste profesores"
            description="Sumá el plantel docente de tu academia para empezar a vincularlo en las coreografías."
          />
        )}
      </PortalListPage>

      <CreateProfessorDialog
        key={dialogResetKey}
        actionData={visibleActionData}
        isOpen={isCreateDialogOpen}
        isSubmitting={createProfessorFetcher.state !== "idle"}
        onOpenChange={(nextOpen) => {
          setIsCreateDialogOpen(nextOpen);

          if (!nextOpen) {
            setDismissServerState(true);
            setDialogResetKey((currentValue) => currentValue + 1);
          }
        }}
        submit={createProfessorFetcher.submit}
      />
    </>
  );
}

export default function PortalProfesoresRoute({
  loaderData,
}: {
  loaderData: LoaderData;
}) {
  return <PortalProfesoresRouteView loaderData={loaderData} />;
}

function ProfessorsTable({ professors }: { professors: ProfessorRow[] }) {
  const columns: DataTableColumn<ProfessorRow>[] = [
    {
      id: "name",
      header: "Nombre",
      className: "w-1/2 font-medium",
      headerClassName: "w-1/2",
      cell: (professor) => <ProfessorDetailLink professor={professor} />,
      filterValue: (professor) =>
        `${professor.firstName} ${professor.lastName} ${professor.documentNumber ?? ""}`,
      sortValue: (professor) => `${professor.firstName} ${professor.lastName}`,
    },
    {
      id: "document",
      header: "Documento",
      className: "w-1/4 text-muted-foreground",
      headerClassName: "w-1/4",
      cell: (professor) => formatProfessorDocument(professor),
      filterValue: (professor) => professor.documentNumber ?? "",
    },
    {
      id: "status",
      header: "Estado",
      className: "w-1/4",
      headerClassName: "w-1/4",
      cell: (professor) => (
        <div className="flex flex-wrap gap-2">
          {getProfessorStateBadges(professor).map((badge) => (
            <Badge key={badge.label} variant={badge.variant}>
              {badge.label}
            </Badge>
          ))}
        </div>
      ),
      filterValues: (professor) => [
        professor.active ? "active" : "archived",
        professor.participationStatus,
        professor.isIncomplete ? "incomplete" : "complete",
      ],
    },
  ];

  return (
    <DataTable
      mode="client"
      rows={professors}
      columns={columns}
      getRowKey={(professor) => professor.id}
      searchPlaceholder="Buscar profesor por nombre o número de documento"
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
              label: "Completitud",
              options: [
                { label: "Completo", value: "complete" },
                { label: "Incompleto", value: "incomplete" },
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
      baseFacetedFilterValues={baseProfessorFilters}
      emptyMessage="No hay profesores que coincidan con la búsqueda o los filtros."
      initialSort={{ columnId: "name", direction: "asc" }}
    />
  );
}

function ProfessorDetailLink({ professor }: { professor: ProfessorRow }) {
  const href = `/portal/profesores/${professor.id}`;
  const isTransitioning = useViewTransitionState(href);

  return (
    <Link
      to={href}
      viewTransition
      style={getPortalRecordTitleViewTransitionStyle(isTransitioning)}
      className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {professor.firstName} {professor.lastName}
    </Link>
  );
}

function CreateProfessorDialog({
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
  const form = useForm<CreateProfessorFormValues>({
    resolver: zodResolver(createProfessorSchema),
    defaultValues: actionData?.values ?? emptyProfessorValues,
  });
  const serverFieldErrors =
    actionData?.fieldErrors ?? emptyProfessorFieldErrors;

  useEffect(() => {
    form.reset(actionData?.values ?? emptyProfessorValues);
  }, [actionData?.values, form]);

  useApplyServerFieldErrors(form, serverFieldErrors);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Nuevo profesor</DialogTitle>
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
          <input type="hidden" name="intent" value="create-professor" />
          <FieldGroup>
            <ProfessorTextField
              control={form.control}
              fieldName="firstName"
              id={firstNameId}
              label="Nombre"
              autoComplete="given-name"
              serverError={serverFieldErrors.firstName}
            />

            <ProfessorTextField
              control={form.control}
              fieldName="lastName"
              id={lastNameId}
              label="Apellido"
              autoComplete="family-name"
              serverError={serverFieldErrors.lastName}
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

function ProfessorTextField({
  autoComplete,
  control,
  fieldName,
  id,
  label,
  serverError,
}: {
  autoComplete: string;
  control: Control<CreateProfessorFormValues>;
  fieldName: keyof CreateProfessorFormValues;
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

function formatProfessorDocument(professor: ProfessorRow) {
  if (!professor.documentType || !professor.documentNumber) {
    return <span className="text-muted-foreground">Sin documento</span>;
  }

  if (professor.documentType === "dni") {
    return `DNI ${professor.documentNumber}`;
  }

  if (professor.documentType === "passport") {
    return `Pasaporte ${professor.documentNumber}`;
  }

  return `Otro ${professor.documentNumber}`;
}

function getProfessorStateBadges(professor: ProfessorRow) {
  const badges: ProfessorBadge[] = [
    {
      label: getProfessorParticipationLabel(professor.participationStatus),
      variant:
        professor.participationStatus === "participating"
          ? ("outline" as const)
          : ("secondary" as const),
    },
  ];

  if (!professor.active) {
    badges.unshift({ label: "Archivado", variant: "outline" as const });
  }

  badges.push(
    professor.isIncomplete
      ? { label: "Incompleto", variant: "secondary" as const }
      : { label: "Completo", variant: "default" as const },
  );

  return badges;
}

function getProfessorParticipationLabel(
  status: ProfessorRow["participationStatus"],
) {
  if (status === "participating") {
    return "Participando";
  }

  return "No participando";
}

function formValue(formData: FormData, fieldName: keyof CreateProfessorInput) {
  const value = formData.get(fieldName);

  return typeof value === "string" ? value : "";
}
