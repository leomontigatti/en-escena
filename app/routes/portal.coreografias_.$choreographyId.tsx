import {
  Check,
  ChevronDown,
  Ellipsis,
  LoaderCircle,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type SubmitEvent,
} from "react";
import { createPortal } from "react-dom";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  redirect,
  useActionData,
  useFetcher,
  useSearchParams,
  Link,
} from "react-router";
import { z } from "zod";

import type { PortalRouteHandle } from "@/components/portal/ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "@/components/ui/combobox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldGroup,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import {
  deleteChoreography,
  findChoreographyForAcademyEvent,
  getChoreographyDeletionAvailability,
  listDancerOptionsForChoreography,
  listProfessorOptionsForChoreography,
  resolveChoreographyDancers,
  type ResolveChoreographyDancersResult,
  updateChoreographyDancers,
  updateChoreographyProfessors,
} from "@/lib/portal/choreographies.server";
import {
  formatGroupTypeLabel,
  formatOperationalPendingItemLabel,
} from "@/lib/portal/choreographies";
import { getPortalEventContext } from "@/lib/portal/event-context.server";
import {
  requiredFieldMessage,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";
import { cn } from "@/lib/shared/utils";
import { showRouteNotificationToast } from "@/lib/shared/route-notification-toasts";

const choreographyNotFoundMessage = "No encontramos esa Coreografía.";
const choreographyProfessorsUpdatedSearchParam = "actualizado";
const choreographyProfessorsUpdatedSuccessMessage =
  "Profesores actualizados correctamente.";
const choreographyDancersUpdatedSearchParam = "bailarines-actualizados";
const choreographyDancersUpdatedSuccessMessage =
  "Bailarines actualizados correctamente.";
const choreographyDeletedSearchParam = "eliminada";
const resolveChoreographyDancersIntent = "resolve-choreography-dancers";
const updateChoreographyDancersIntent = "update-choreography-dancers";
const updateChoreographyProfessorsIntent = "update-choreography-professors";
const deleteChoreographyIntent = "delete-choreography";
const readOnlyEventMessage = "Este Evento es de solo lectura.";
const unsupportedActionMessage = "Acción no soportada.";
const rosterEditorReviewMessage = "Revisá los bailarines de la coreografía.";

const dancerEditorSchema = z.object({
  dancerIds: z.array(z.string().trim().min(1)).min(1, requiredFieldMessage),
  experienceLevelId: z.string().trim().optional(),
  scheduleEntryId: z.string().trim().optional(),
});

type DancerEditorValues = z.infer<typeof dancerEditorSchema>;
type DancerEditorFieldErrors = {
  dancerIds?: string;
  experienceLevelId?: string;
  scheduleEntryId?: string;
};
const emptyDancerEditorFieldErrors: DancerEditorFieldErrors = {};

type DancerResolutionActionData = {
  intent: typeof resolveChoreographyDancersIntent;
  result: ResolveChoreographyDancersResult;
};

type ActionData =
  | {
      status: "dancer-error";
      fieldErrors?: DancerEditorFieldErrors;
      message: string;
      selectedDancerIds: string[];
      selectedExperienceLevelId: string | null;
      selectedScheduleEntryId?: string;
    }
  | {
      status: "professor-error";
      message: string;
      selectedProfessorIds: string[];
    }
  | undefined;

type PortalCoreografiaDetalleRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
  actionData?: ActionData;
  initialDancerResolution?: ResolveChoreographyDancersResult;
  initialDeleteDialogOpen?: boolean;
};

type LoaderData = PortalCoreografiaDetalleRouteProps["loaderData"];
type ChoreographyDancerOption = LoaderData["availableDancers"][number];
type ChoreographyProfessor = LoaderData["choreography"]["professors"][number];
type ChoreographyProfessorOption = LoaderData["availableProfessors"][number];
type ChoreographyOperationalStatus =
  LoaderData["choreography"]["operationalStatus"];
type ResolvedDancerResolution = Extract<
  ResolveChoreographyDancersResult,
  { ok: true }
>["resolution"];
type DancerResolutionState = {
  groupType: LoaderData["choreography"]["groupType"];
  categoryId: LoaderData["choreography"]["categoryId"];
  categoryName: LoaderData["choreography"]["categoryName"];
  categoryCalculationMode:
    | ResolvedDancerResolution["categoryCalculationMode"]
    | null;
  categoryAgeBasis: ResolvedDancerResolution["categoryAgeBasis"] | null;
  experienceLevelRequired: boolean;
  experienceLevelOptions: Array<{
    id: string;
    name: string;
  }>;
};

export const meta = () => [
  { title: "Detalle de Coreografía | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [
    { label: "Coreografías", to: "/portal/coreografias" },
    (match) => {
      const data = match.data as LoaderData | undefined;

      return data?.choreography ? { label: data.choreography.name } : null;
    },
  ],
} satisfies PortalRouteHandle;

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { choreographyId?: string };
}) {
  const { academy } = await requireAcademyUser(request);
  const choreographyId = params.choreographyId;

  if (!choreographyId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const eventContext = await getPortalEventContext(request);
  const selectedEventId = eventContext.selectedEvent?.id;

  if (!selectedEventId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const choreography = await findChoreographyForAcademyEvent(
    academy.id,
    selectedEventId,
    choreographyId,
    {
      isRegistrationOpen: eventContext.isRegistrationOpen,
    },
  );

  if (!choreography) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const availableProfessors = await listProfessorOptionsForChoreography(
    academy.id,
    choreography.professors.map((professor) => professor.id),
  );
  const availableDancers = await listDancerOptionsForChoreography(
    academy.id,
    choreography.dancers.map((dancer) => dancer.id),
  );

  return {
    choreography,
    dancerEditingEligibility: choreography.dancerEditingEligibility,
    availableDancers,
    availableProfessors,
    deletionAvailability: getChoreographyDeletionAvailability({
      isReadOnly: eventContext.isReadOnly,
      isRegistrationOpen: eventContext.isRegistrationOpen,
    }),
    eventContext,
    successMessage: readUpdatedSuccessMessage(
      new URL(request.url).searchParams,
    ),
  };
}

export async function action({
  request,
  params,
}: {
  request: Request;
  params: { choreographyId?: string };
}) {
  const { academy } = await requireAcademyUser(request);
  const choreographyId = readChoreographyId(params);
  const eventContext = await getPortalEventContext(request);
  const selectedEventId = eventContext.selectedEvent?.id;

  if (!selectedEventId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  if (eventContext.isReadOnly) {
    throw new Response(readOnlyEventMessage, { status: 403 });
  }

  const formData = await request.formData();
  const intent = readFormString(formData, "intent");

  if (intent === updateChoreographyProfessorsIntent) {
    const professorIds = readFormStringArray(formData, "professorIds");
    return await handleUpdateChoreographyProfessorsAction({
      academyId: academy.id,
      eventId: selectedEventId,
      choreographyId,
      professorIds,
    });
  }

  if (intent === resolveChoreographyDancersIntent) {
    return {
      intent,
      result: await resolveChoreographyDancers({
        academyId: academy.id,
        choreographyId,
        dancerIds: readFormStringArray(formData, "dancerIds"),
        eventId: selectedEventId,
        isRegistrationOpen: eventContext.isRegistrationOpen,
      }),
    } satisfies DancerResolutionActionData;
  }

  if (intent === updateChoreographyDancersIntent) {
    const dancerIds = readFormStringArray(formData, "dancerIds");
    return await handleUpdateChoreographyDancersAction({
      academyId: academy.id,
      choreographyId,
      dancerIds,
      eventId: selectedEventId,
      experienceLevelId: readOptionalFormString(formData, "experienceLevelId"),
      isRegistrationOpen: eventContext.isRegistrationOpen,
      scheduleEntryId: readOptionalFormString(formData, "scheduleEntryId"),
    });
  }

  if (intent === deleteChoreographyIntent) {
    assertDeleteConfirmationMatches(formData, choreographyId);

    return await handleDeleteChoreographyAction({
      academyId: academy.id,
      eventId: selectedEventId,
      choreographyId,
    });
  }

  throw new Response(unsupportedActionMessage, { status: 400 });
}

export function PortalCoreografiaDetalleRouteView({
  loaderData,
  actionData,
  initialDeleteDialogOpen = false,
}: PortalCoreografiaDetalleRouteProps) {
  const canDeleteChoreography = loaderData.deletionAvailability.canDelete;
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(
    initialDeleteDialogOpen,
  );

  return (
    <>
      <section
        className="flex flex-col gap-6"
        aria-labelledby="coreografia-title"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 id="coreografia-title" className="text-xl font-semibold">
              Editar coreografía
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Actualizá bailarines y profesores de esta coreografía.
            </p>
          </div>
          {canDeleteChoreography ? (
            <DropdownMenu>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-lg"
                        aria-label="Acciones"
                      >
                        <Ellipsis aria-hidden="true" />
                        <span className="sr-only">Acciones</span>
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="left">Acciones</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={(event) => {
                      event.preventDefault();
                      setIsDeleteDialogOpen(true);
                    }}
                  >
                    Eliminar
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        <OperationalStatusSummary
          operationalStatus={loaderData.choreography.operationalStatus}
        />

        <Card>
          <CardContent className="flex flex-col gap-5">
            {actionData?.message ? (
              <ChoreographyNotice variant="error">
                {actionData.message}
              </ChoreographyNotice>
            ) : null}

            <FieldGroup className="grid gap-5 md:grid-cols-2">
              <ReadonlyDetailField
                className="md:col-span-2"
                label="Nombre"
                value={loaderData.choreography.name}
              />
              <ReadonlyDetailField
                label="Modalidad"
                value={loaderData.choreography.modalityName}
              />
              <ReadonlyDetailField
                label="Submodalidad"
                value={loaderData.choreography.submodalityName ?? ""}
              />
              <ReadonlyDetailField
                label="Categoría"
                value={loaderData.choreography.categoryName ?? "Sin asignar"}
              />
              <ReadonlyDetailField
                label="Tipo de grupo"
                value={formatGroupTypeLabel(loaderData.choreography.groupType)}
              />
              <ReadonlyDetailField
                label="Nivel de experiencia"
                value={loaderData.choreography.experienceLevelName ?? ""}
              />
              <ReadonlyDetailField
                label="Cronograma"
                value={loaderData.choreography.scheduleLabel}
              />
            </FieldGroup>

            <ChoreographyPeopleFields
              availableDancers={loaderData.availableDancers}
              availableProfessors={loaderData.availableProfessors}
              selectedDancers={loaderData.choreography.dancers}
              selectedProfessors={loaderData.choreography.professors}
            />
          </CardContent>
          <CardFooter className="justify-end gap-3 border-0 bg-transparent pt-0">
            <Button asChild variant="outline" size="lg">
              <Link to="/portal/coreografias">Volver</Link>
            </Button>
            <Button type="button" size="lg" disabled>
              <Check aria-hidden="true" data-icon="inline-start" />
              Guardar
            </Button>
          </CardFooter>
        </Card>

        {canDeleteChoreography ? (
          <DeleteChoreographyDialog
            choreographyId={loaderData.choreography.id}
            isOpen={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
            warningMessage={loaderData.deletionAvailability.warningMessage}
          />
        ) : null}
      </section>
    </>
  );
}

export default function PortalCoreografiaDetalleRoute({
  loaderData,
}: PortalCoreografiaDetalleRouteProps) {
  const actionData = useActionData() as ActionData;
  const [searchParams] = useSearchParams();
  const saved = readUpdatedSuccessMessage(searchParams) !== null;

  useEffect(() => {
    if (saved) {
      showRouteNotificationToast("coreografia-guardada");
    }
  }, [saved]);

  return (
    <PortalCoreografiaDetalleRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}

function ReadonlyDetailField({
  className,
  label,
  value,
}: {
  className?: string;
  label: string;
  value: string;
}) {
  const id = useId();

  return (
    <Field className={className} data-disabled>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldContent>
        <Input id={id} value={value} disabled readOnly />
      </FieldContent>
    </Field>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}

function ChoreographyPeopleFields({
  availableDancers,
  availableProfessors,
  selectedDancers,
  selectedProfessors,
}: {
  availableDancers: ChoreographyDancerOption[];
  availableProfessors: ChoreographyProfessorOption[];
  selectedDancers: LoaderData["choreography"]["dancers"];
  selectedProfessors: LoaderData["choreography"]["professors"];
}) {
  const dancerOptions = useMemo(
    () =>
      availableDancers.map((dancer) => ({
        value: dancer.id,
        label: formatDancerName(dancer),
      })),
    [availableDancers],
  );
  const professorOptions = useMemo(
    () =>
      availableProfessors.map((professor) => ({
        value: professor.id,
        label: formatProfessorName(professor),
      })),
    [availableProfessors],
  );
  const initialDancerIds = useMemo(
    () => selectedDancers.map((dancer) => dancer.id),
    [selectedDancers],
  );
  const initialProfessorIds = useMemo(
    () => selectedProfessors.map((professor) => professor.id),
    [selectedProfessors],
  );

  return (
    <FieldGroup>
      <ChoreographyPeopleComboboxField
        label="Bailarines"
        options={dancerOptions}
        placeholder="Buscar bailarines"
        selectedValues={initialDancerIds}
      />
      <ChoreographyPeopleComboboxField
        label="Profesores"
        options={professorOptions}
        placeholder="Buscar profesores"
        selectedValues={initialProfessorIds}
      />
    </FieldGroup>
  );
}

type ChoreographyPeopleComboboxOption = {
  value: string;
  label: string;
};

function ChoreographyPeopleComboboxField({
  label,
  options,
  placeholder,
  selectedValues,
}: {
  label: string;
  options: ChoreographyPeopleComboboxOption[];
  placeholder: string;
  selectedValues: string[];
}) {
  const [currentValues, setCurrentValues] = useState(selectedValues);

  useEffect(() => {
    setCurrentValues(selectedValues);
  }, [selectedValues]);

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <FieldContent>
        <ChoreographyMultipleSelectControl
          emptyPlaceholder="Sin opciones"
          isInvalid={false}
          onBlur={() => {}}
          options={options}
          triggerLabel={placeholder}
          value={currentValues}
          onValueChange={setCurrentValues}
        />
      </FieldContent>
    </Field>
  );
}

function ChoreographyMultipleSelectControl({
  emptyPlaceholder,
  isInvalid,
  onBlur,
  onSelectionChange,
  options,
  triggerLabel,
  value,
  onValueChange: setValue,
}: {
  emptyPlaceholder: string;
  isInvalid: boolean;
  onBlur: () => void;
  onSelectionChange?: () => void;
  options: ChoreographyPeopleComboboxOption[];
  triggerLabel: string;
  value: string[];
  onValueChange: (value: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
  const optionByValue = useMemo(
    () => new Map(options.map((option) => [option.value, option])),
    [options],
  );
  const selectedOptions = value.map((selectedValue) => ({
    value: selectedValue,
    label: optionByValue.get(selectedValue)?.label ?? selectedValue,
  }));
  const availableOptions = options.filter(
    (option) => !value.includes(option.value),
  );
  const filteredOptions = availableOptions.filter((option) =>
    option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const emptyMessage =
    options.length === 0
      ? emptyPlaceholder
      : availableOptions.length === 0
        ? "Ya seleccionaste todas las opciones."
        : "Sin resultados.";

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function updateDropdownPosition() {
      const trigger = triggerRef.current;

      if (!trigger) {
        return;
      }

      const triggerRect = trigger.getBoundingClientRect();
      const top = triggerRect.bottom + 4;

      setDropdownStyle({
        top,
        left: triggerRect.left,
        width: triggerRect.width,
        maxHeight: `min(18rem, calc(100vh - ${top + 8}px))`,
      });
    }

    updateDropdownPosition();
    inputRef.current?.focus();
    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", updateDropdownPosition, true);

    return () => {
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [isOpen, value.length]);

  function handleSelect(nextValue: string) {
    setValue([...value, nextValue]);
    onSelectionChange?.();
    setQuery("");
    setIsOpen(true);
  }

  function handleRemove(nextValue: string) {
    setValue(value.filter((selectedValue) => selectedValue !== nextValue));
    onSelectionChange?.();
  }

  const dropdown =
    isOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={dropdownRef}
            className="pointer-events-auto fixed z-[70] flex flex-col rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10"
            style={dropdownStyle}
          >
            <div className="p-1 pb-0">
              <Input
                ref={inputRef}
                value={query}
                disabled={options.length === 0}
                placeholder="Buscar..."
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain p-1">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(option.value)}
                  >
                    {option.label}
                  </button>
                ))
              ) : (
                <p className="py-2 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </p>
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      className="relative"
      onBlur={(event) => {
        const nextFocusedElement = event.relatedTarget as Node | null;

        if (
          !event.currentTarget.contains(nextFocusedElement) &&
          !dropdownRef.current?.contains(nextFocusedElement)
        ) {
          setIsOpen(false);
          onBlur();
        }
      }}
    >
      <div
        ref={triggerRef}
        role="combobox"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-invalid={isInvalid ? true : undefined}
        className={cn(
          "flex min-h-8 cursor-default flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent bg-clip-padding px-2.5 py-1 text-sm transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          isInvalid &&
            "border-destructive ring-3 ring-destructive/20 dark:border-destructive/50 dark:ring-destructive/40",
        )}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setIsOpen((current) => !current);
          }
        }}
      >
        {selectedOptions.length > 0 ? (
          <>
            {selectedOptions.map((option) => (
              <span
                key={option.value}
                className="flex h-[calc(--spacing(5.25))] w-fit items-center justify-center gap-1 rounded-sm bg-muted px-1.5 text-xs font-medium whitespace-nowrap text-foreground"
              >
                {option.label}
                <button
                  type="button"
                  className="-mr-1 flex size-4 items-center justify-center rounded-sm opacity-50 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-3"
                  aria-label={`Quitar ${option.label}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleRemove(option.value);
                  }}
                >
                  <X aria-hidden="true" />
                </button>
              </span>
            ))}
            <span className="flex-1 text-muted-foreground">{triggerLabel}</span>
          </>
        ) : (
          <span className="flex-1 text-muted-foreground">{triggerLabel}</span>
        )}
        <ChevronDown
          aria-hidden="true"
          className="ml-auto size-4 text-muted-foreground"
        />
      </div>
      {dropdown}
    </div>
  );
}

function ChoreographyNotice({
  children,
  variant = "default",
}: {
  children: ReactNode;
  variant?: "default" | "error";
}) {
  return (
    <Alert variant={variant === "error" ? "destructive" : "default"}>
      <TriangleAlert aria-hidden="true" />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

function DancerEditor({
  actionData,
  choreography,
  dancers,
  initialResolution,
  selectedDancers,
  selectedScheduleEntryId,
}: {
  actionData: Extract<ActionData, { status: "dancer-error" }> | undefined;
  choreography: LoaderData["choreography"];
  dancers: ChoreographyDancerOption[];
  initialResolution: ResolveChoreographyDancersResult | undefined;
  selectedDancers: LoaderData["choreography"]["dancers"];
  selectedScheduleEntryId: string;
}) {
  const experienceLevelFieldId = useId();
  const resolutionFetcher = useFetcher<DancerResolutionActionData>();
  const dancerOptions = useMemo(
    () =>
      dancers.map((dancer) => ({
        value: dancer.id,
        label: formatDancerName(dancer),
        description: getDancerAvailabilityCopy(dancer.active),
        active: dancer.active,
      })),
    [dancers],
  );
  const dancerOptionByValue = useMemo(
    () => new Map(dancerOptions.map((option) => [option.value, option])),
    [dancerOptions],
  );
  const selectedDancerIds = useMemo(
    () =>
      actionData?.selectedDancerIds ??
      selectedDancers.map((dancer) => dancer.id),
    [actionData?.selectedDancerIds, selectedDancers],
  );
  const selectedExperienceLevelId =
    actionData?.selectedExperienceLevelId ??
    choreography.experienceLevelId ??
    "";
  const initialDancerIds = useMemo(
    () => selectedDancers.map((dancer) => dancer.id),
    [selectedDancers],
  );
  const initialSelectionKey = useMemo(
    () => getDancerSelectionKey(selectedDancerIds),
    [selectedDancerIds],
  );
  const persistedSelectionKey = useMemo(
    () => getDancerSelectionKey(initialDancerIds),
    [initialDancerIds],
  );
  const persistedResolution = useMemo(
    () => getPersistedDancerResolutionState(choreography),
    [choreography],
  );
  const hasInitialResolution = initialResolution !== undefined;
  const hasInitialResolvedSelection =
    hasInitialResolution && initialSelectionKey !== persistedSelectionKey;
  const initialDerivedResolution = useMemo(
    () =>
      hasInitialResolvedSelection && initialResolution?.ok
        ? mapResolvedDancerResolutionState(initialResolution)
        : persistedResolution,
    [hasInitialResolvedSelection, initialResolution, persistedResolution],
  );
  const [derivedResolution, setDerivedResolution] = useState(
    initialDerivedResolution,
  );
  const [resolvedSelectionKey, setResolvedSelectionKey] = useState(
    hasInitialResolvedSelection ? initialSelectionKey : persistedSelectionKey,
  );
  const [resolution, setResolution] =
    useState<ResolveChoreographyDancersResult | null>(
      initialResolution ?? null,
    );
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const submittedSelectionKeyRef = useRef<string | null>(null);
  const form = useForm<DancerEditorValues>({
    resolver: zodResolver(dancerEditorSchema),
    defaultValues: {
      dancerIds: selectedDancerIds,
      experienceLevelId: selectedExperienceLevelId,
      scheduleEntryId:
        actionData?.selectedScheduleEntryId ?? selectedScheduleEntryId,
    },
  });
  const fieldErrors = actionData?.fieldErrors ?? emptyDancerEditorFieldErrors;
  const watchedDancerIds = form.watch("dancerIds");
  const watchedExperienceLevelId = form.watch("experienceLevelId") ?? "";
  const watchedScheduleEntryId = form.watch("scheduleEntryId") ?? "";
  const dancerSelectionKey = useMemo(
    () => getDancerSelectionKey(watchedDancerIds),
    [watchedDancerIds],
  );
  const resolutionData = resolutionFetcher.data;
  const isResolving = resolutionFetcher.state !== "idle";
  const hasRosterChanged = useMemo(
    () => dancerSelectionKey !== persistedSelectionKey,
    [dancerSelectionKey, persistedSelectionKey],
  );
  const scheduleResolution = resolution?.ok
    ? resolution.resolution.schedule
    : null;
  const scheduleOptions = getSelectableScheduleOptions(scheduleResolution);
  const shouldShowScheduleResolution = hasRosterChanged || hasInitialResolution;
  const changeExplanations = useMemo(
    () =>
      getDancerChangeExplanations({
        currentResolution: persistedResolution,
        nextResolution: derivedResolution,
      }),
    [derivedResolution, persistedResolution],
  );

  useEffect(() => {
    form.reset({
      dancerIds: selectedDancerIds,
      experienceLevelId: selectedExperienceLevelId,
      scheduleEntryId:
        actionData?.selectedScheduleEntryId ?? selectedScheduleEntryId,
    });
    setDerivedResolution(initialDerivedResolution);
    setResolution(initialResolution ?? null);
    setResolutionError(null);
    setResolvedSelectionKey(
      hasInitialResolvedSelection ? initialSelectionKey : persistedSelectionKey,
    );
    submittedSelectionKeyRef.current = null;
  }, [
    actionData?.selectedScheduleEntryId,
    form,
    hasInitialResolution,
    hasInitialResolvedSelection,
    initialDerivedResolution,
    initialSelectionKey,
    initialResolution,
    persistedSelectionKey,
    selectedDancerIds,
    selectedExperienceLevelId,
    selectedScheduleEntryId,
  ]);

  useApplyServerFieldErrors(form, fieldErrors);

  useEffect(() => {
    if (watchedDancerIds.length === 0) {
      setResolutionError(null);
      return;
    }

    if (dancerSelectionKey === persistedSelectionKey) {
      setDerivedResolution(persistedResolution);
      setResolution(hasInitialResolution ? (initialResolution ?? null) : null);
      setResolutionError(null);
      setResolvedSelectionKey(persistedSelectionKey);
      form.setValue("scheduleEntryId", selectedScheduleEntryId, {
        shouldDirty: false,
      });
      submittedSelectionKeyRef.current = null;
      return;
    }

    if (
      hasInitialResolvedSelection &&
      dancerSelectionKey === initialSelectionKey
    ) {
      setDerivedResolution(initialDerivedResolution);
      setResolution(initialResolution ?? null);
      setResolutionError(null);
      setResolvedSelectionKey(initialSelectionKey);
      submittedSelectionKeyRef.current = null;
      return;
    }

    if (
      dancerSelectionKey === resolvedSelectionKey ||
      dancerSelectionKey === submittedSelectionKeyRef.current
    ) {
      return;
    }

    resolutionFetcher.submit(
      buildResolveChoreographyDancersFormData(watchedDancerIds),
      { method: "post" },
    );
    submittedSelectionKeyRef.current = dancerSelectionKey;
  }, [
    dancerSelectionKey,
    hasInitialResolution,
    initialSelectionKey,
    hasInitialResolvedSelection,
    initialDerivedResolution,
    initialResolution,
    persistedResolution,
    persistedSelectionKey,
    form,
    resolutionFetcher,
    resolvedSelectionKey,
    selectedScheduleEntryId,
    watchedDancerIds,
  ]);

  useEffect(() => {
    if (
      resolutionFetcher.state !== "idle" ||
      resolutionData?.intent !== resolveChoreographyDancersIntent
    ) {
      return;
    }

    const submittedSelectionKey =
      submittedSelectionKeyRef.current ?? dancerSelectionKey;
    submittedSelectionKeyRef.current = null;
    setResolvedSelectionKey(submittedSelectionKey);

    if (!resolutionData.result.ok) {
      setResolution(resolutionData.result);
      form.setValue("scheduleEntryId", "", { shouldDirty: true });
      setResolutionError(resolutionData.result.message);
      return;
    }

    setResolution(resolutionData.result);
    const nextResolution = mapResolvedDancerResolutionState(
      resolutionData.result,
    );
    const categoryChanged =
      derivedResolution.categoryId !== nextResolution.categoryId;
    const currentExperienceLevelValue =
      form.getValues("experienceLevelId") ?? "";
    let nextExperienceLevelValue = currentExperienceLevelValue;

    if (!nextResolution.experienceLevelRequired || categoryChanged) {
      nextExperienceLevelValue = "";
    } else if (
      currentExperienceLevelValue.length > 0 &&
      !nextResolution.experienceLevelOptions.some(
        (option) => option.id === currentExperienceLevelValue,
      )
    ) {
      nextExperienceLevelValue = "";
    }

    if (nextExperienceLevelValue !== currentExperienceLevelValue) {
      form.setValue("experienceLevelId", nextExperienceLevelValue, {
        shouldDirty: true,
      });
    }

    form.clearErrors("experienceLevelId");
    const nextSchedule = resolutionData.result.resolution.schedule;

    if (
      nextSchedule.status === "keep-current" ||
      nextSchedule.status === "auto"
    ) {
      form.setValue("scheduleEntryId", nextSchedule.selectedScheduleEntryId, {
        shouldDirty: true,
      });
      form.clearErrors("scheduleEntryId");
    } else if (nextSchedule.status === "multiple") {
      if (
        !nextSchedule.options.some(
          (option) => option.id === watchedScheduleEntryId,
        )
      ) {
        form.setValue("scheduleEntryId", "", { shouldDirty: true });
      }
    } else {
      form.setValue("scheduleEntryId", "", { shouldDirty: true });
    }

    setDerivedResolution(nextResolution);
    setResolutionError(null);

    if (
      nextResolution.experienceLevelRequired &&
      nextExperienceLevelValue.length === 0
    ) {
      queueMicrotask(() => {
        document.getElementById(experienceLevelFieldId)?.focus();
      });
    }
  }, [
    dancerSelectionKey,
    derivedResolution.categoryId,
    experienceLevelFieldId,
    form,
    resolutionData,
    resolutionFetcher.state,
    watchedScheduleEntryId,
  ]);

  const getDancerLabel = (value: string) =>
    dancerOptionByValue.get(value)?.label ?? value;
  const canSubmit =
    watchedDancerIds.length > 0 &&
    !isResolving &&
    !resolutionError &&
    dancerSelectionKey === resolvedSelectionKey &&
    (!hasRosterChanged ||
      (resolution?.ok === true &&
        scheduleResolution?.status !== "none" &&
        (scheduleResolution?.status !== "multiple" ||
          watchedScheduleEntryId.length > 0))) &&
    (!derivedResolution.experienceLevelRequired ||
      watchedExperienceLevelId.length > 0);

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    void form.handleSubmit(() => {
      if (dancerSelectionKey !== resolvedSelectionKey || isResolving) {
        return;
      }

      if (
        derivedResolution.experienceLevelRequired &&
        watchedExperienceLevelId.length === 0
      ) {
        form.setError("experienceLevelId", {
          message: requiredFieldMessage,
          type: "manual",
        });
        document.getElementById(experienceLevelFieldId)?.focus();
        return;
      }

      if (hasRosterChanged) {
        if (!resolution?.ok || scheduleResolution?.status === "none") {
          return;
        }

        if (
          scheduleResolution?.status === "multiple" &&
          watchedScheduleEntryId.length === 0
        ) {
          form.setError("scheduleEntryId", {
            message: requiredFieldMessage,
            type: "manual",
          });
          return;
        }

        form.clearErrors("scheduleEntryId");
      }

      event.currentTarget.submit();
    })(event);
  };

  return (
    <form method="post" className="flex flex-col gap-5" onSubmit={handleSubmit}>
      <input
        type="hidden"
        name="intent"
        value={updateChoreographyDancersIntent}
      />
      <FieldGroup>
        <FieldSet>
          <FieldLegend variant="label">Bailarines</FieldLegend>
          <FieldDescription>
            Elegí bailarines activos de tu academia. Los archivados solo pueden
            mantenerse o quitarse mientras ya sigan vinculados.
          </FieldDescription>
          <Controller
            control={form.control}
            name="dancerIds"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.error ? true : undefined}>
                {field.value.map((dancerId) => (
                  <input
                    key={dancerId}
                    type="hidden"
                    name="dancerIds"
                    value={dancerId}
                  />
                ))}
                <Combobox
                  items={dancerOptions.map((option) => option.value)}
                  itemToStringValue={getDancerLabel}
                  multiple
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <ComboboxChips
                    aria-invalid={fieldState.error ? true : undefined}
                  >
                    <ComboboxValue>
                      {field.value.map((value) => (
                        <ComboboxChip key={value}>
                          {getDancerLabel(value)}
                        </ComboboxChip>
                      ))}
                    </ComboboxValue>
                    <ComboboxChipsInput
                      disabled={dancerOptions.length === 0}
                      onBlur={field.onBlur}
                      placeholder={
                        dancerOptions.length > 0
                          ? "Buscar bailarines"
                          : "Sin bailarines disponibles"
                      }
                    />
                  </ComboboxChips>
                  <ComboboxContent>
                    <ComboboxEmpty>Sin resultados.</ComboboxEmpty>
                    <ComboboxList>
                      {(value) => {
                        const option = dancerOptionByValue.get(value);

                        return (
                          <ComboboxItem key={value} value={value}>
                            <span className="flex min-w-0 flex-col gap-0.5">
                              <span>{option?.label ?? value}</span>
                              <span className="text-xs text-muted-foreground">
                                {option?.description}
                              </span>
                            </span>
                            {option?.active === false ? (
                              <ArchivedBadge />
                            ) : null}
                          </ComboboxItem>
                        );
                      }}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
                {field.value.length > 0 ? (
                  <ComboboxSearchCue>Buscar bailarines</ComboboxSearchCue>
                ) : null}
                <FieldContent>
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />
        </FieldSet>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Datos recalculados</CardTitle>
            {isResolving ? (
              <CardAction>
                <Badge variant="secondary">
                  <LoaderCircle aria-hidden="true" />
                  Calculando
                </Badge>
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <dl className="grid gap-3 sm:grid-cols-2">
              <DetailItem
                label="Tipo de grupo"
                value={formatGroupTypeLabel(derivedResolution.groupType)}
              />
              <DetailItem
                label="Categoría"
                value={derivedResolution.categoryName ?? "Sin asignar"}
              />
            </dl>
            <Alert>
              <AlertDescription className="flex flex-col gap-2">
                {changeExplanations.map((explanation) => (
                  <span key={explanation}>{explanation}</span>
                ))}
                <span>
                  El precio se recalcula al confirmar los bailarines. Este paso
                  no muestra importes.
                </span>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {resolutionError ? (
          <ChoreographyNotice variant="error">
            {resolutionError}
          </ChoreographyNotice>
        ) : null}

        {derivedResolution.experienceLevelRequired ? (
          <Controller
            control={form.control}
            name="experienceLevelId"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.error ? true : undefined}>
                <FieldLabel htmlFor={experienceLevelFieldId}>
                  Nivel de experiencia
                </FieldLabel>
                <FieldContent>
                  <Select
                    name={field.name}
                    value={field.value ?? ""}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger
                      id={experienceLevelFieldId}
                      aria-invalid={fieldState.error ? true : undefined}
                      className="w-full"
                    >
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {derivedResolution.experienceLevelOptions.map(
                          (option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.name}
                            </SelectItem>
                          ),
                        )}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Elegilo antes de guardar cuando la categoría resultante lo
                    requiere.
                  </FieldDescription>
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />
        ) : null}

        {watchedScheduleEntryId ? (
          <input
            type="hidden"
            name="scheduleEntryId"
            value={watchedScheduleEntryId}
          />
        ) : null}

        {isResolving ? (
          <ChoreographyNotice>
            Resolviendo cronograma compatible para este roster.
          </ChoreographyNotice>
        ) : null}

        {shouldShowScheduleResolution && resolution?.ok === false ? (
          <ChoreographyNotice variant="error">
            {resolution.message}
          </ChoreographyNotice>
        ) : null}

        {shouldShowScheduleResolution ? (
          <DancerScheduleResolutionFields
            control={form.control}
            resolution={scheduleResolution}
            scheduleOptions={scheduleOptions}
          />
        ) : null}
      </FieldGroup>

      <div className="flex justify-end">
        <Button type="submit" disabled={!canSubmit}>
          {isResolving ? (
            <>
              <LoaderCircle aria-hidden="true" data-icon="inline-start" />
              Calculando
            </>
          ) : (
            <>
              <Check aria-hidden="true" data-icon="inline-start" />
              Guardar bailarines
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

function getSelectableScheduleOptions(
  scheduleResolution:
    | Extract<
        ResolveChoreographyDancersResult,
        { ok: true }
      >["resolution"]["schedule"]
    | null,
) {
  if (!scheduleResolution || scheduleResolution.status === "none") {
    return [];
  }

  return scheduleResolution.options;
}

function DancerScheduleResolutionFields({
  control,
  resolution,
  scheduleOptions,
}: {
  control: ReturnType<typeof useForm<DancerEditorValues>>["control"];
  resolution:
    | Extract<
        ResolveChoreographyDancersResult,
        { ok: true }
      >["resolution"]["schedule"]
    | null;
  scheduleOptions: Array<{
    id: string;
    capacity: number;
    groupTypeKey: string;
    scheduleBlock: {
      name: string;
    };
  }>;
}) {
  if (!resolution) {
    return null;
  }

  if (resolution.status === "none") {
    return (
      <ChoreographyNotice variant="error">
        {resolution.error}
      </ChoreographyNotice>
    );
  }

  if (resolution.status === "keep-current") {
    return (
      <ChoreographyNotice>
        El cronograma actual sigue siendo compatible y se conserva.
      </ChoreographyNotice>
    );
  }

  if (resolution.status === "auto") {
    return (
      <ChoreographyNotice>
        El cronograma compatible se selecciona automáticamente.
      </ChoreographyNotice>
    );
  }

  return (
    <Controller
      control={control}
      name="scheduleEntryId"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.error ? true : undefined}>
          <FieldLabel htmlFor="choreography-dancer-schedule">
            Cronograma
          </FieldLabel>
          <FieldContent>
            <Select value={field.value ?? ""} onValueChange={field.onChange}>
              <SelectTrigger
                aria-invalid={fieldState.error ? true : undefined}
                id="choreography-dancer-schedule"
                className="w-full"
              >
                <SelectValue placeholder="Seleccionar cronograma" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {scheduleOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {formatScheduleOptionLabel(option)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              Elegí un cronograma compatible antes de guardar los bailarines.
            </FieldDescription>
            <FieldError>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

function DancerReadonlyList({
  dancers,
}: {
  dancers: LoaderData["choreography"]["dancers"];
}) {
  return (
    <ul className="flex flex-col gap-3">
      {dancers.map((dancer) => (
        <li
          key={dancer.id}
          className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <p className="truncate text-sm font-medium">
              {dancer.firstName} {dancer.lastName}
            </p>
            <p className="text-sm text-muted-foreground">
              Edad al inicio del Evento: {dancer.ageAtEventStart}
            </p>
          </div>
          {!dancer.active ? <ArchivedBadge /> : null}
        </li>
      ))}
    </ul>
  );
}

function ComboboxSearchCue({ children }: { children: React.ReactNode }) {
  return <span className="flex-1 text-muted-foreground">{children}</span>;
}

function ProfessorEditor({
  professors,
  selectedProfessorIds,
}: {
  professors: ChoreographyProfessorOption[];
  selectedProfessorIds: Set<string>;
}) {
  const professorOptions = useMemo(
    () =>
      professors.map((professor) => ({
        value: professor.id,
        label: formatProfessorName(professor),
        description: getProfessorAvailabilityCopy(professor.active),
        active: professor.active,
      })),
    [professors],
  );
  const professorOptionByValue = useMemo(
    () => new Map(professorOptions.map((option) => [option.value, option])),
    [professorOptions],
  );
  const [currentProfessorIds, setCurrentProfessorIds] = useState(
    Array.from(selectedProfessorIds),
  );

  const getProfessorLabel = (value: string) =>
    professorOptionByValue.get(value)?.label ?? value;

  return (
    <form method="post" className="flex flex-col gap-5">
      <input
        type="hidden"
        name="intent"
        value={updateChoreographyProfessorsIntent}
      />
      <FieldGroup>
        {currentProfessorIds.map((professorId) => (
          <input
            key={professorId}
            type="hidden"
            name="professorIds"
            value={professorId}
          />
        ))}
        {professorOptions.length > 0 ? (
          <FieldSet>
            <FieldLegend variant="label">Profesores</FieldLegend>
            <FieldDescription>
              Elegí los profesores vinculados a esta coreografía.
            </FieldDescription>
            <Combobox
              items={professorOptions.map((option) => option.value)}
              itemToStringValue={getProfessorLabel}
              multiple
              value={currentProfessorIds}
              onValueChange={setCurrentProfessorIds}
            >
              <ComboboxChips>
                <ComboboxValue>
                  {currentProfessorIds.map((value) => (
                    <ComboboxChip key={value}>
                      {getProfessorLabel(value)}
                    </ComboboxChip>
                  ))}
                </ComboboxValue>
                <ComboboxChipsInput placeholder="Buscar profesores" />
              </ComboboxChips>
              <ComboboxContent>
                <ComboboxEmpty>Sin resultados.</ComboboxEmpty>
                <ComboboxList>
                  {(value) => {
                    const option = professorOptionByValue.get(value);

                    return (
                      <ComboboxItem key={value} value={value}>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span>{option?.label ?? value}</span>
                          <span className="text-xs text-muted-foreground">
                            {option?.description}
                          </span>
                        </span>
                        {option?.active === false ? <ArchivedBadge /> : null}
                      </ComboboxItem>
                    );
                  }}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            {currentProfessorIds.length > 0 ? (
              <ComboboxSearchCue>Buscar profesores</ComboboxSearchCue>
            ) : null}
          </FieldSet>
        ) : (
          <ChoreographyNotice>
            No hay Profesores activos o vinculados para editar en esta
            Coreografía.
          </ChoreographyNotice>
        )}
      </FieldGroup>

      <div className="flex justify-end">
        <Button type="submit">
          <Check aria-hidden="true" data-icon="inline-start" />
          Guardar Profesores
        </Button>
      </div>
    </form>
  );
}

function ProfessorReadonlyList({
  professors,
}: {
  professors: ChoreographyProfessor[];
}) {
  if (professors.length === 0) {
    return (
      <ChoreographyNotice>
        Esta Coreografía todavía no tiene Profesores vinculados.
      </ChoreographyNotice>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {professors.map((professor) => (
        <li
          key={professor.id}
          className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2"
        >
          <p className="truncate text-sm font-medium">
            {professor.firstName} {professor.lastName}
          </p>
          {!professor.active ? <ArchivedBadge /> : null}
        </li>
      ))}
    </ul>
  );
}

function OperationalStatusSummary({
  operationalStatus,
}: {
  operationalStatus: ChoreographyOperationalStatus;
}) {
  const academyPendingItems = operationalStatus.pendingItems.filter(
    (pendingItem) => pendingItem !== "category",
  );

  if (academyPendingItems.length === 0) {
    return null;
  }

  return (
    <Alert>
      <TriangleAlert aria-hidden="true" />
      <AlertDescription>
        {academyPendingItems.length === 1 ? "Falta" : "Faltan"} cargar{" "}
        {formatAcademyPendingItems(academyPendingItems)}.
      </AlertDescription>
    </Alert>
  );
}

function formatAcademyPendingItems(
  pendingItems: ChoreographyOperationalStatus["pendingItems"],
) {
  return formatList(
    pendingItems.map((pendingItem) => {
      if (pendingItem === "music") {
        return "archivo de música";
      }

      return formatOperationalPendingItemLabel(pendingItem).toLowerCase();
    }),
  );
}

function formatList(items: string[]) {
  if (items.length <= 1) {
    return items[0] ?? "";
  }

  return `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;
}

function ArchivedBadge() {
  return <Badge variant="secondary">Archivado</Badge>;
}

function getDancerSectionDescription(
  dancerEditingEligibility: LoaderData["choreography"]["dancerEditingEligibility"],
) {
  if (dancerEditingEligibility.canEdit) {
    return "Actualizá el roster y revisá cómo cambian tipo de grupo, categoría y nivel antes de guardar.";
  }

  return "Consultá los bailarines actuales de esta coreografía y el motivo principal por el que la edición no está disponible.";
}

function DeleteChoreographyDialog({
  choreographyId,
  isOpen,
  onOpenChange,
  warningMessage,
}: {
  choreographyId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  warningMessage: string | null;
}) {
  return (
    <>
      {isOpen ? (
        <div className="sr-only">
          <p>¿Eliminar Coreografía?</p>
          <p>
            En esta versión la eliminación es definitiva y libera el cupo del
            Cronograma.
          </p>
          {warningMessage ? <p>{warningMessage}</p> : null}
          <input type="hidden" name="intent" value={deleteChoreographyIntent} />
        </div>
      ) : null}
      <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
        {isOpen ? (
          <AlertDialogContent
            forceMount
            className="w-[calc(100%-2rem)] max-w-lg gap-4 p-6 sm:max-w-lg"
          >
            <AlertDialogHeader className="flex flex-col items-start gap-1.5 text-left">
              <AlertDialogTitle>¿Eliminar Coreografía?</AlertDialogTitle>
              <AlertDialogDescription>
                En esta versión la eliminación es definitiva y libera el cupo
                del Cronograma.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {warningMessage ? (
              <p className="rounded-lg bg-muted px-4 py-3 text-sm leading-6 text-muted-foreground">
                {warningMessage}
              </p>
            ) : null}
            <AlertDialogFooter className="m-0 rounded-none border-0 bg-transparent p-0">
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <form method="post">
                <input
                  type="hidden"
                  name="intent"
                  value={deleteChoreographyIntent}
                />
                <input
                  type="hidden"
                  name="confirmDeletion"
                  value={choreographyId}
                />
                <Button type="submit" variant="destructive">
                  <Trash2 aria-hidden="true" data-icon="inline-start" />
                  Eliminar Coreografía
                </Button>
              </form>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </>
  );
}

function getProfessorSectionDescription(canEditProfessors: boolean) {
  return canEditProfessors
    ? "Actualizá los Profesores operativos aunque la inscripción esté cerrada."
    : "Los Profesores vinculados quedan en solo lectura para este Evento.";
}

function getProfessorAvailabilityCopy(isActive: boolean) {
  return isActive
    ? "Disponible para nuevas asignaciones."
    : "Archivado pero conservado por vínculo existente.";
}

function getDancerAvailabilityCopy(isActive: boolean) {
  return isActive
    ? "Disponible para nuevas asignaciones."
    : "Archivado pero conservado por vínculo existente.";
}

function formatDancerName(dancer: { firstName: string; lastName: string }) {
  return `${dancer.firstName} ${dancer.lastName}`;
}

function formatProfessorName(professor: {
  firstName: string;
  lastName: string;
}) {
  return `${professor.firstName} ${professor.lastName}`;
}

function formatScheduleOptionLabel(option: {
  scheduleBlock: {
    name: string;
  };
  groupTypeKey: string;
  capacity: number;
}) {
  return `${option.scheduleBlock.name} · ${formatScheduleGroupTypeLabel(option.groupTypeKey)} · Cupo ${option.capacity}`;
}

function formatScheduleGroupTypeLabel(groupTypeKey: string) {
  if (isChoreographyGroupType(groupTypeKey)) {
    return formatGroupTypeLabel(groupTypeKey);
  }

  return groupTypeKey;
}

function isChoreographyGroupType(
  value: string,
): value is Parameters<typeof formatGroupTypeLabel>[0] {
  return (
    value === "solo" ||
    value === "duo" ||
    value === "trio" ||
    value === "grupal"
  );
}

function readChoreographyId(params: { choreographyId?: string }) {
  if (!params.choreographyId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  return params.choreographyId;
}

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function readFormStringArray(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .flatMap((value) => (typeof value === "string" && value ? [value] : []));
}

function readOptionalFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" && value.length > 0 ? value : null;
}

function getDancerSelectionKey(dancerIds: string[]) {
  return [...dancerIds].sort().join("|");
}

function getPersistedDancerResolutionState(
  choreography: LoaderData["choreography"],
): DancerResolutionState {
  return {
    groupType: choreography.groupType,
    categoryId: choreography.categoryId,
    categoryName: choreography.categoryName,
    categoryCalculationMode: null,
    categoryAgeBasis: null,
    experienceLevelRequired:
      choreography.experienceLevelId !== null ||
      choreography.operationalStatus.pendingItems.includes("experienceLevel"),
    experienceLevelOptions:
      choreography.experienceLevelId && choreography.experienceLevelName
        ? [
            {
              id: choreography.experienceLevelId,
              name: choreography.experienceLevelName,
            },
          ]
        : [],
  };
}

function mapResolvedDancerResolutionState(
  result: Extract<ResolveChoreographyDancersResult, { ok: true }>,
): DancerResolutionState {
  return {
    groupType: result.resolution.groupType,
    categoryId: result.resolution.categoryId,
    categoryName: result.resolution.categoryName,
    categoryCalculationMode: result.resolution.categoryCalculationMode ?? null,
    categoryAgeBasis: result.resolution.categoryAgeBasis ?? null,
    experienceLevelRequired: result.resolution.experienceLevel.required,
    experienceLevelOptions: result.resolution.experienceLevel.options,
  };
}

function getDancerChangeExplanations(input: {
  currentResolution: DancerResolutionState;
  nextResolution: DancerResolutionState;
}) {
  const explanations: string[] = [];

  if (input.currentResolution.groupType !== input.nextResolution.groupType) {
    explanations.push(
      "El tipo de grupo cambió porque depende de la cantidad de bailarines seleccionados.",
    );
  }

  if (input.currentResolution.categoryId !== input.nextResolution.categoryId) {
    explanations.push(
      getCategoryChangeExplanation(
        input.nextResolution.categoryCalculationMode,
        input.nextResolution.categoryAgeBasis,
      ),
    );
  }

  return explanations;
}

function getCategoryChangeExplanation(
  categoryCalculationMode: DancerResolutionState["categoryCalculationMode"],
  categoryAgeBasis: DancerResolutionState["categoryAgeBasis"],
) {
  if (categoryCalculationMode === "group_tolerance") {
    return "La categoría cambió según la tolerancia de edades permitida para el grupo.";
  }

  if (categoryCalculationMode === "group_average") {
    if (typeof categoryAgeBasis === "number") {
      return `La categoría cambió según la edad promedio del grupo: ${categoryAgeBasis} años.`;
    }

    return "La categoría cambió según la edad promedio del grupo.";
  }

  if (typeof categoryAgeBasis === "number") {
    return `La categoría cambió según la mayor edad del grupo: ${categoryAgeBasis} años.`;
  }

  return "La categoría cambió según el criterio de edad aplicable al grupo.";
}

function buildResolveChoreographyDancersFormData(dancerIds: string[]) {
  const UrlSearchParamsCtor =
    typeof window !== "undefined" ? window.URLSearchParams : URLSearchParams;
  const searchParams = new UrlSearchParamsCtor();
  searchParams.set("intent", resolveChoreographyDancersIntent);

  for (const dancerId of dancerIds) {
    searchParams.append("dancerIds", dancerId);
  }

  return searchParams;
}

async function handleUpdateChoreographyProfessorsAction(input: {
  academyId: string;
  eventId: string;
  choreographyId: string;
  professorIds: string[];
}) {
  const result = await updateChoreographyProfessors({
    academyId: input.academyId,
    eventId: input.eventId,
    choreographyId: input.choreographyId,
    professorIds: input.professorIds,
  });

  if (!result.ok) {
    return {
      status: "professor-error" as const,
      message: result.message,
      selectedProfessorIds: input.professorIds,
    };
  }

  return redirect(
    `/portal/coreografias/${input.choreographyId}?${choreographyProfessorsUpdatedSearchParam}=1`,
  );
}

async function handleUpdateChoreographyDancersAction(input: {
  academyId: string;
  choreographyId: string;
  dancerIds: string[];
  eventId: string;
  experienceLevelId: string | null;
  isRegistrationOpen: boolean;
  scheduleEntryId: string | null;
}) {
  const parsed = dancerEditorSchema.safeParse({
    dancerIds: input.dancerIds,
    scheduleEntryId: input.scheduleEntryId ?? "",
  });

  if (!parsed.success) {
    return {
      status: "dancer-error" as const,
      fieldErrors: {
        dancerIds:
          parsed.error.flatten().fieldErrors.dancerIds?.[0] ?? undefined,
        scheduleEntryId:
          parsed.error.flatten().fieldErrors.scheduleEntryId?.[0] ?? undefined,
      },
      message: rosterEditorReviewMessage,
      selectedDancerIds: input.dancerIds,
      selectedExperienceLevelId: input.experienceLevelId,
      selectedScheduleEntryId: input.scheduleEntryId ?? undefined,
    };
  }

  const result = await updateChoreographyDancers({
    academyId: input.academyId,
    choreographyId: input.choreographyId,
    dancerIds: parsed.data.dancerIds,
    eventId: input.eventId,
    experienceLevelId: input.experienceLevelId,
    isRegistrationOpen: input.isRegistrationOpen,
    scheduleEntryId: parsed.data.scheduleEntryId,
  });

  if (!result.ok) {
    return {
      status: "dancer-error" as const,
      fieldErrors: result.fieldErrors,
      message: result.message,
      selectedDancerIds: parsed.data.dancerIds,
      selectedExperienceLevelId: input.experienceLevelId,
      selectedScheduleEntryId: parsed.data.scheduleEntryId,
    };
  }

  return redirect(
    `/portal/coreografias/${input.choreographyId}?${choreographyDancersUpdatedSearchParam}=1`,
  );
}

async function handleDeleteChoreographyAction(input: {
  academyId: string;
  eventId: string;
  choreographyId: string;
}) {
  await deleteChoreography({
    academyId: input.academyId,
    eventId: input.eventId,
    choreographyId: input.choreographyId,
  });

  return redirect(`/portal/coreografias?${choreographyDeletedSearchParam}=1`);
}

function assertDeleteConfirmationMatches(
  formData: FormData,
  choreographyId: string,
) {
  if (formData.get("confirmDeletion") !== choreographyId) {
    throw new Response(unsupportedActionMessage, { status: 400 });
  }
}

function readUpdatedSuccessMessage(searchParams: URLSearchParams) {
  if (searchParams.get(choreographyDancersUpdatedSearchParam) === "1") {
    return choreographyDancersUpdatedSuccessMessage;
  }

  if (searchParams.get(choreographyProfessorsUpdatedSearchParam) === "1") {
    return choreographyProfessorsUpdatedSuccessMessage;
  }

  return null;
}
