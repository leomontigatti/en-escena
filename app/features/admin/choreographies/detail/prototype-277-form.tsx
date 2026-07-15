/**
 * PROTOTYPE-ONLY — throwaway UI for issue #277. Answers: ¿cómo se comporta el
 * detalle/formulario de coreografía cuando el admin edita el ROSTER (bailarines
 * + profesores) desde ahí, dado que cambiar bailarines re-resuelve tipo de
 * grupo / categoría / nivel y puede requerir re-elegir nivel o cronograma?
 *
 * Calca el form real (app/features/admin/choreographies/detail/view.tsx) y el
 * patrón del roster editor del portal (roster-editor-form.tsx):
 *  - desbloquea Bailarines y Profesores (hoy `disabled`) con MultiComboboxField;
 *  - Modalidad/Submodalidad read-only (cascada de modalidad NO se toca acá);
 *  - Tipo de grupo y Categoría siguen viéndose como campos lockeados (input/
 *    select con candado); su valor se actualiza solo al recalcular, sin tachar
 *    el anterior ni mostrar badges;
 *  - si el recálculo REQUIERE elegir Nivel de experiencia o Cronograma, ese
 *    campo se HABILITA como select editable (igual que el portal);
 *  - si no hay categoría compatible, bloquea Guardar;
 *  - si la coreografía tiene presentación, el roster queda lockeado (bloqueo duro);
 *  - Guardar arranca deshabilitado hasta detectar un cambio;
 *  - al Guardar, una confirmación LIVIANA avisa que quitar es borrado físico
 *    irreversible (el monto vuelve al saldo disponible). El detalle financiero
 *    (devoluciones, precios) se resuelve en finanzas (#276), no acá. Sin motivos
 *    ni auditoría (#272).
 *
 * No real data, no mutations reales. Delete once folded into the real view.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ExternalLink,
  LoaderCircle,
  Lock,
  Trash2,
} from "lucide-react";
import { useId, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { MultiComboboxField } from "@/components/shared/multi-combobox-field";
import {
  ReadOnlyField,
  ReadOnlySelectField,
} from "@/components/shared/read-only-field";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { SelectField } from "@/components/shared/select-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
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
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { formatScheduleDateTime } from "@/lib/choreographies/schedule-formatters";
import { choreographyGroupTypeOptions } from "@/lib/portal/choreographies";
import { cn } from "@/lib/shared/utils";

// ---------------------------------------------------------------------------
// Mock domain
// ---------------------------------------------------------------------------

type Stage = "impaga" | "señada" | "pagada";
type GroupType = "solo" | "duo" | "trio" | "grupal";

type PoolDancer = { id: string; name: string; age: number };

type Inscription = { dancerId: string; stage: Stage };

type MockScenario = {
  key: string;
  label: string;
  academyName: string;
  choreographyName: string;
  modalityName: string;
  submodalityName: string;
  scheduleCapacityId: string;
  scheduleLabel: string;
  hasPresentation: boolean;
  musicStorageKey: string;
  musicDownloadUrl: string | null;
  dancerPool: PoolDancer[];
  professorPool: Array<{ id: string; name: string }>;
  inscriptions: Inscription[];
  professorIds: string[];
};

const PROFESSORS = [
  { id: "pf1", name: "Carla Duarte" },
  { id: "pf2", name: "Nicolás Vera" },
  { id: "pf3", name: "Romina Alsina" },
];

const POOL: PoolDancer[] = [
  { id: "d1", name: "Ana Bianchi", age: 15 },
  { id: "d2", name: "Lucía Fernández", age: 14 },
  { id: "d3", name: "Martín Rossi", age: 13 },
  { id: "d4", name: "Sofía Paz", age: 15 },
  { id: "d5", name: "Tomás Vega", age: 17 }, // sube a categoría Mayor (requiere nivel)
  { id: "d6", name: "Julia Ferreyra", age: 12 },
  { id: "d7", name: "Benito Salas", age: 5 }, // fuera de rango → sin categoría
];

const EXPERIENCE_LEVEL_OPTIONS = [
  { value: "inicial", label: "Inicial" },
  { value: "intermedio", label: "Intermedio" },
  { value: "avanzado", label: "Avanzado" },
];

const SCHEDULE_OPTIONS = [
  {
    value: "s1",
    label: formatScheduleDateTime({
      name: "Bloque 1",
      scheduledDate: "2026-10-22",
      startTime: "13:00",
    }),
  },
  {
    value: "s2",
    label: formatScheduleDateTime({
      name: "Bloque 2",
      scheduledDate: "2026-10-22",
      startTime: "16:30",
    }),
  },
  {
    value: "s3",
    label: formatScheduleDateTime({
      name: "Bloque 3",
      scheduledDate: "2026-10-23",
      startTime: "11:00",
    }),
  },
];

const SCENARIOS_RAW: Omit<
  MockScenario,
  "musicStorageKey" | "musicDownloadUrl"
>[] = [
  {
    key: "firmada",
    label: "Firmada (grupal juvenil)",
    academyName: "Estudio Compás",
    choreographyName: "Reflejos — Jazz",
    modalityName: "Jazz",
    submodalityName: "Grupal",
    scheduleCapacityId: "s1",
    scheduleLabel: SCHEDULE_OPTIONS[0].label,
    hasPresentation: false,
    dancerPool: POOL,
    professorPool: PROFESSORS,
    inscriptions: [
      { dancerId: "d1", stage: "señada" },
      { dancerId: "d2", stage: "señada" },
      { dancerId: "d3", stage: "señada" },
      { dancerId: "d4", stage: "señada" },
    ],
    professorIds: ["pf1"],
  },
  {
    key: "impaga",
    label: "Impaga (dúo)",
    academyName: "Estudio Compás",
    choreographyName: "Eco — Contemporáneo",
    modalityName: "Contemporáneo",
    submodalityName: "Dúo",
    scheduleCapacityId: "s2",
    scheduleLabel: SCHEDULE_OPTIONS[1].label,
    hasPresentation: false,
    dancerPool: POOL,
    professorPool: PROFESSORS,
    inscriptions: [
      { dancerId: "d1", stage: "impaga" },
      { dancerId: "d2", stage: "impaga" },
    ],
    professorIds: ["pf2"],
  },
  {
    key: "presentacion",
    label: "Con presentación (lockeada)",
    academyName: "Estudio Compás",
    choreographyName: "Vértigo — Jazz",
    modalityName: "Jazz",
    submodalityName: "Grupal",
    scheduleCapacityId: "s3",
    scheduleLabel: SCHEDULE_OPTIONS[2].label,
    hasPresentation: true,
    dancerPool: POOL,
    professorPool: PROFESSORS,
    inscriptions: [
      { dancerId: "d1", stage: "pagada" },
      { dancerId: "d2", stage: "pagada" },
      { dancerId: "d3", stage: "pagada" },
      { dancerId: "d4", stage: "pagada" },
    ],
    professorIds: ["pf1", "pf3"],
  },
  {
    key: "solo",
    label: "Solo señado",
    academyName: "Estudio Compás",
    choreographyName: "Latido — Solo",
    modalityName: "Contemporáneo",
    submodalityName: "Solo",
    scheduleCapacityId: "s1",
    scheduleLabel: SCHEDULE_OPTIONS[0].label,
    hasPresentation: false,
    dancerPool: POOL,
    professorPool: PROFESSORS,
    inscriptions: [{ dancerId: "d1", stage: "señada" }],
    professorIds: ["pf2"],
  },
];

// Música cargada (mock) uniforme, para que el campo se vea como en el form real.
export const SCENARIOS: MockScenario[] = SCENARIOS_RAW.map((s) => ({
  ...s,
  musicStorageKey: "reflejos-jazz.m4a",
  musicDownloadUrl: "#",
}));

// ---------------------------------------------------------------------------
// Resolution (mock de app/lib/choreographies/registration-resolution.server.ts)
// ---------------------------------------------------------------------------

/** Real: 1→solo, 2→duo, 3→trio, ≥4→grupal. */
function deriveGroupType(count: number): GroupType {
  if (count <= 1) return "solo";
  if (count === 2) return "duo";
  if (count === 3) return "trio";
  return "grupal";
}

type MockCategory = {
  name: string;
  minAge: number;
  maxAge: number;
  requiresLevel: boolean;
};

// Categorías mock; se resuelve por edad del bailarín más grande (basis "oldest").
const CATEGORIES: MockCategory[] = [
  { name: "Kids", minAge: 6, maxAge: 11, requiresLevel: false },
  { name: "Juvenil", minAge: 12, maxAge: 15, requiresLevel: false },
  { name: "Mayor", minAge: 16, maxAge: 99, requiresLevel: true },
];

type Resolution = {
  groupType: GroupType;
  categoryName: string | null;
  oldestAge: number | null;
  requiresLevel: boolean;
  compatible: boolean;
};

function resolveRoster(dancers: PoolDancer[]): Resolution {
  const groupType = deriveGroupType(dancers.length);
  if (dancers.length === 0) {
    return {
      groupType,
      categoryName: null,
      oldestAge: null,
      requiresLevel: false,
      compatible: false,
    };
  }
  const oldestAge = Math.max(...dancers.map((d) => d.age));
  const category = CATEGORIES.find(
    (c) => oldestAge >= c.minAge && oldestAge <= c.maxAge,
  );
  return {
    groupType,
    categoryName: category?.name ?? null,
    oldestAge,
    requiresLevel: category?.requiresLevel ?? false,
    compatible: Boolean(category),
  };
}

// ---------------------------------------------------------------------------
// Prototype scenario control (claramente NO parte del diseño)
// ---------------------------------------------------------------------------

export function ScenarioControl({
  scenarios,
  current,
  onChange,
}: {
  scenarios: MockScenario[];
  current: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-2 text-xs">
      <span className="px-1 font-medium text-amber-700 dark:text-amber-400">
        Escenario (prototipo):
      </span>
      {scenarios.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => onChange(s.key)}
          className={cn(
            "rounded-md border px-2.5 py-1 transition-colors",
            s.key === current
              ? "border-foreground bg-foreground text-background"
              : "border-border hover:bg-muted",
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

const formSchema = z.object({
  name: z.string().trim().min(1, "Ingresá un nombre."),
  dancerIds: z.array(z.string()).min(1, "Debe haber al menos un bailarín."),
  professorIds: z.array(z.string()).min(1, "Debe haber al menos un profesor."),
  experienceLevelId: z.string(),
  scheduleCapacityId: z.string(),
  musicStorageKey: z.string(),
});
type FormValues = z.input<typeof formSchema>;

export function RosterFormPrototype({ scenario }: { scenario: MockScenario }) {
  const locked = scenario.hasPresentation;
  // Baseline mutable: tras guardar, el roster guardado pasa a ser la nueva
  // referencia (así Guardar vuelve a deshabilitarse hasta el próximo cambio).
  const [baseline, setBaseline] = useState(scenario.inscriptions);
  const [scheduleLabel, setScheduleLabel] = useState(scenario.scheduleLabel);
  const originalDancerIds = baseline.map((i) => i.dancerId);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: scenario.choreographyName,
      dancerIds: originalDancerIds,
      professorIds: scenario.professorIds,
      experienceLevelId: "",
      // Arranca vacío: si el recálculo exige re-elegir cronograma, el admin
      // debe elegirlo activamente (gatea Guardar). El label read-only sale del
      // escenario, no de este valor.
      scheduleCapacityId: "",
      musicStorageKey: scenario.musicStorageKey,
    },
  });

  const selectedIds =
    useWatch({ control: form.control, name: "dancerIds" }) ?? [];
  const experienceLevelId = useWatch({
    control: form.control,
    name: "experienceLevelId",
  });
  const scheduleCapacityId = useWatch({
    control: form.control,
    name: "scheduleCapacityId",
  });

  const [confirming, setConfirming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const before = resolveRoster(
    scenario.dancerPool.filter((d) => originalDancerIds.includes(d.id)),
  );
  const after = resolveRoster(
    scenario.dancerPool.filter((d) => selectedIds.includes(d.id)),
  );

  const addedIds = selectedIds.filter((id) => !originalDancerIds.includes(id));
  const removed = baseline.filter((i) => !selectedIds.includes(i.dancerId));
  const dirty = addedIds.length > 0 || removed.length > 0;

  // Habilitación de campos derivados según el portal: solo si el recálculo lo
  // exige. Nivel cuando la categoría lo requiere; cronograma cuando cambió el
  // tipo de grupo (la capacidad anterior deja de aplicar y hay que re-elegir).
  const needsLevel = dirty && after.compatible && after.requiresLevel;
  const needsSchedule =
    dirty && after.compatible && after.groupType !== before.groupType;

  const blockedByCategory = dirty && !after.compatible;
  const levelOk = !needsLevel || (experienceLevelId ?? "") !== "";
  const scheduleOk = !needsSchedule || (scheduleCapacityId ?? "") !== "";
  const canSave =
    !locked && dirty && !blockedByCategory && levelOk && scheduleOk;

  const groupTypeValue = dirty ? after.groupType : before.groupType;
  const categoryValue = dirty
    ? after.compatible
      ? (after.categoryName ?? "Sin asignar")
      : "Sin categoría compatible"
    : (before.categoryName ?? "Sin asignar");
  // Nivel read-only: vacío si no hay uno asignado (no ponemos "No aplica").
  const readonlyLevelValue = "";

  function handleConfirm() {
    // Simula el guardado: spinner mientras "persiste", luego reconstruye estado.
    setIsSaving(true);
    window.setTimeout(() => {
      // El roster guardado se vuelve la nueva referencia; las altas quedan impagas.
      setBaseline(
        selectedIds.map(
          (id) =>
            baseline.find((i) => i.dancerId === id) ?? {
              dancerId: id,
              stage: "impaga" as const,
            },
        ),
      );
      const pickedSchedule = SCHEDULE_OPTIONS.find(
        (o) => o.value === form.getValues("scheduleCapacityId"),
      );
      if (pickedSchedule) setScheduleLabel(pickedSchedule.label);
      form.reset({
        name: form.getValues("name"),
        dancerIds: selectedIds,
        professorIds: form.getValues("professorIds"),
        experienceLevelId: form.getValues("experienceLevelId"),
        scheduleCapacityId: form.getValues("scheduleCapacityId"),
        musicStorageKey: form.getValues("musicStorageKey"),
      });
      setIsSaving(false);
      setConfirming(false);
      setSaved(true);
    }, 700);
  }

  return (
    <>
      <AdminResourceLayout
        requireSelectedEvent={false}
        title="Detalle coreografía"
        description="Revisá la coreografía registrada para el evento activo."
        headerAction={
          <ResourceActionsMenu contentClassName="w-52">
            <DropdownMenuGroup>
              <DropdownMenuItem
                variant="destructive"
                onSelect={(e) => e.preventDefault()}
              >
                <Trash2 aria-hidden="true" />
                Eliminar coreografía
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </ResourceActionsMenu>
        }
      >
        <form onSubmit={(e) => e.preventDefault()}>
          <AdminResourceFormCard
            footer={
              <>
                <Button variant="outline" type="button">
                  <ChevronLeft aria-hidden="true" data-icon="inline-start" />
                  Volver
                </Button>
                <Button
                  type="button"
                  disabled={!canSave}
                  onClick={() => setConfirming(true)}
                >
                  <Check aria-hidden="true" data-icon="inline-start" />
                  Guardar
                </Button>
              </>
            }
          >
            {locked ? (
              <Alert variant="warning">
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>Roster bloqueado por presentación</AlertTitle>
                <AlertDescription>
                  Esta coreografía no puede editarse porque ya posee una
                  presentación asociada.
                </AlertDescription>
              </Alert>
            ) : null}

            {saved ? (
              <Alert variant="success">
                <Check aria-hidden="true" />
                <AlertDescription>
                  Cambios de roster aplicados (simulado). El impacto financiero
                  se resuelve en la lista financiera de la academia y en el
                  detalle financiero de la coreografía (#276).
                </AlertDescription>
              </Alert>
            ) : null}

            {blockedByCategory && !locked ? (
              <Alert variant="destructive">
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>No hay categoría compatible</AlertTitle>
                <AlertDescription>
                  Con este roster ({groupTypeLabel(after.groupType)}
                  {after.oldestAge !== null
                    ? `, mayor de ${after.oldestAge} años`
                    : ""}
                  ) no existe una categoría válida. Ajustá el roster para poder
                  guardar.
                </AlertDescription>
              </Alert>
            ) : null}

            <FieldGroup className="grid gap-5 md:grid-cols-2">
              <ReadOnlyField
                className="md:col-span-2"
                label="Academia"
                value={scenario.academyName}
              />
              <TextInputField
                className="md:col-span-2"
                control={form.control}
                label="Nombre"
                name="name"
                disabled={locked}
              />
              <ReadOnlyField label="Modalidad" value={scenario.modalityName} />
              <ReadOnlyField
                label="Submodalidad"
                value={scenario.submodalityName}
              />
              <ReadOnlySelectField
                label="Tipo de grupo"
                options={choreographyGroupTypeOptions}
                value={groupTypeValue}
              />
              <ReadOnlyField label="Categoría" value={categoryValue} />
              {needsLevel && !locked ? (
                <SelectField
                  control={form.control}
                  label="Nivel de experiencia"
                  name="experienceLevelId"
                  options={EXPERIENCE_LEVEL_OPTIONS}
                  placeholder="Elegí el nivel"
                />
              ) : (
                <ReadOnlyField
                  label="Nivel de experiencia"
                  value={readonlyLevelValue}
                />
              )}
              {needsSchedule && !locked ? (
                <SelectField
                  control={form.control}
                  label="Cronograma"
                  name="scheduleCapacityId"
                  options={SCHEDULE_OPTIONS}
                  placeholder="Elegí el cronograma"
                />
              ) : (
                <ReadOnlyField label="Cronograma" value={scheduleLabel} />
              )}
            </FieldGroup>

            <FieldGroup>
              <MultiComboboxField
                control={form.control}
                disabled={locked}
                emptyMessage="Sin bailarines vinculados"
                inputName="dancerIds"
                label="Bailarines"
                name="dancerIds"
                options={scenario.dancerPool.map((d) => ({
                  label: `${d.name} · ${d.age} años`,
                  value: d.id,
                }))}
                placeholder="Buscá y agregá bailarines"
                searchable
              />

              <MultiComboboxField
                control={form.control}
                disabled={locked}
                emptyMessage="Sin profesores vinculados"
                inputName="professorIds"
                label="Profesores"
                name="professorIds"
                options={scenario.professorPool.map((p) => ({
                  label: p.name,
                  value: p.id,
                }))}
                placeholder="Buscá y agregá profesores"
                searchable
              />

              {/* Música: por ahora se muestra como campo deshabilitado, igual
                  que la imagen del documento en el detalle de bailarín. */}
              <ReadOnlyMusicField url={scenario.musicDownloadUrl} />
            </FieldGroup>
          </AdminResourceFormCard>
        </form>
      </AdminResourceLayout>

      <SaveConfirmationDialog
        open={confirming}
        onOpenChange={setConfirming}
        isSaving={isSaving}
        onConfirm={handleConfirm}
      />
    </>
  );
}

/**
 * Música mostrada como campo deshabilitado (por ahora), calcado de
 * ReadOnlyDocumentImageField del detalle de bailarín: box estilo input inactivo
 * (opacity-50) con link para abrir y candado a la derecha.
 */
function ReadOnlyMusicField({ url }: { url: string | null }) {
  const id = useId();
  return (
    <Field data-disabled>
      <FieldLabel htmlFor={id}>Archivo de música</FieldLabel>
      <FieldContent>
        <div className="relative">
          <div
            id={id}
            className="flex h-8 w-full min-w-0 items-center rounded-lg border border-input bg-input/50 px-2.5 py-1 pr-9 text-base opacity-50 md:text-sm"
          >
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-w-0 items-center gap-1.5 text-primary underline-offset-4 hover:underline"
              >
                <ExternalLink aria-hidden="true" className="size-3.5" />
                <span className="truncate">Descargar música</span>
              </a>
            ) : (
              <span className="truncate">Sin música cargada</span>
            )}
          </div>
          <Lock
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 size-3 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      </FieldContent>
    </Field>
  );
}

function groupTypeLabel(groupType: GroupType) {
  return (
    choreographyGroupTypeOptions.find((o) => o.value === groupType)?.label ??
    groupType
  );
}

// ---------------------------------------------------------------------------
// Confirmación liviana (guardarraíl; sin montos ni precios — eso es de finanzas)
// ---------------------------------------------------------------------------

function SaveConfirmationDialog({
  open,
  onOpenChange,
  isSaving,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSaving: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !isSaving && onOpenChange(o)}>
      <DialogContent overlayClassName="backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Confirmar edición</DialogTitle>
          <DialogDescription>
            La modificación de inscripciones puede llegar a necesitar atención
            en el estado financiero de la coreografía o la academia.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={isSaving}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button disabled={isSaving} onClick={onConfirm}>
            {isSaving ? (
              <LoaderCircle
                aria-hidden="true"
                className="animate-spin"
                data-icon="inline-start"
              />
            ) : (
              <Check aria-hidden="true" data-icon="inline-start" />
            )}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
