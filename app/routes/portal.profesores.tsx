import { zodResolver } from "@hookform/resolvers/zod";
import { Inbox, Plus } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Controller, useForm, type Control } from "react-hook-form";
import { Link, redirect, useActionData } from "react-router";
import { z } from "zod";

import type { PortalRouteHandle } from "@/components/portal/ui";
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
import {
  createValidatedNativeSubmitHandler,
  requiredFieldMessage,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";

type LoaderData = Awaited<ReturnType<typeof loader>>;
type ActionData = Awaited<ReturnType<typeof action>>;
type ProfessorRow = LoaderData["professors"][number];

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

const defaultProfessorFilters = {
  status: {
    Estado: "active",
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
  const professors = await listAcademyProfessors(academy.id);

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
  const actionData = providedActionData;
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
      <section
        className="flex flex-col gap-6"
        aria-labelledby="profesores-title"
      >
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 id="profesores-title" className="text-xl font-semibold">
              Profesores
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Gestioná los profesores de tu academia y completá su
              identificación cuando tengas los datos.
            </p>
          </div>
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
        </header>

        {loaderData.professors.length > 0 ? (
          <ProfessorsTable professors={loaderData.professors} />
        ) : (
          <Empty className="min-h-64 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Inbox aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Todavía no cargaste profesores</EmptyTitle>
              <EmptyDescription>
                Sumá el plantel docente de tu academia para empezar a vincularlo
                en las coreografías.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </section>

      <CreateProfessorDialog
        key={dialogResetKey}
        actionData={visibleActionData}
        isOpen={isCreateDialogOpen}
        onOpenChange={(nextOpen) => {
          setIsCreateDialogOpen(nextOpen);

          if (!nextOpen) {
            setDismissServerState(true);
            setDialogResetKey((currentValue) => currentValue + 1);
          }
        }}
      />
    </>
  );
}

export default function PortalProfesoresRoute({
  loaderData,
}: {
  loaderData: LoaderData;
}) {
  const actionData = useActionData<typeof action>();

  return (
    <PortalProfesoresRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}

function ProfessorsTable({ professors }: { professors: ProfessorRow[] }) {
  const columns: DataTableColumn<ProfessorRow>[] = [
    {
      id: "name",
      header: "Nombre",
      className: "font-medium",
      cell: (professor) => (
        <Link
          to={`/portal/profesores/${professor.id}`}
          className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {professor.lastName}, {professor.firstName}
        </Link>
      ),
      filterValue: (professor) =>
        `${professor.lastName} ${professor.firstName} ${professor.documentNumber ?? ""}`,
      sortValue: (professor) => `${professor.lastName}, ${professor.firstName}`,
    },
    {
      id: "document",
      header: "Documento",
      cell: (professor) => formatProfessorDocument(professor),
      filterValue: (professor) => professor.documentNumber ?? "",
    },
    {
      id: "status",
      header: "Estado",
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
        professor.isIncomplete ? "incomplete" : "complete",
      ],
    },
  ];

  return (
    <DataTable
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
              label: "Estado",
              options: [
                { label: "Activo", value: "active" },
                { label: "Archivado", value: "archived" },
              ],
            },
            {
              label: "Completitud",
              options: [
                { label: "Completo", value: "complete" },
                { label: "Incompleto", value: "incomplete" },
              ],
            },
          ],
        },
      ]}
      initialFacetedFilterValues={defaultProfessorFilters}
      emptyMessage="No hay profesores que coincidan con la búsqueda o los filtros."
      initialSort={{ columnId: "name", direction: "asc" }}
    />
  );
}

function CreateProfessorDialog({
  actionData,
  isOpen,
  onOpenChange,
}: {
  actionData?: ActionData;
  isOpen: boolean;
  onOpenChange: (nextOpen: boolean) => void;
}) {
  const firstNameId = useId();
  const lastNameId = useId();
  const form = useForm<CreateProfessorFormValues>({
    resolver: zodResolver(createProfessorSchema),
    defaultValues: actionData?.values ?? emptyProfessorValues,
  });
  const serverFieldErrors =
    actionData?.fieldErrors ?? emptyProfessorFieldErrors;

  useApplyServerFieldErrors(form, serverFieldErrors);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo profesor</DialogTitle>
          <DialogDescription>
            Ingresá los datos mínimos para cargarlo en la academia.
          </DialogDescription>
        </DialogHeader>

        <form
          method="post"
          onSubmit={createValidatedNativeSubmitHandler(form)}
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
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit">Guardar profesor</Button>
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
    return "Sin documento";
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
  if (professor.active && professor.isIncomplete) {
    return [{ label: "Incompleto", variant: "secondary" as const }];
  }

  if (professor.active) {
    return [{ label: "Completo", variant: "default" as const }];
  }

  if (professor.isIncomplete) {
    return [
      { label: "Archivado", variant: "outline" as const },
      { label: "Incompleto", variant: "secondary" as const },
    ];
  }

  return [{ label: "Archivado", variant: "outline" as const }];
}

function formValue(formData: FormData, fieldName: keyof CreateProfessorInput) {
  const value = formData.get(fieldName);

  return typeof value === "string" ? value : "";
}
