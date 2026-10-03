import { ChevronRight, Info, TriangleAlert } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  experienceLevelLabel,
  type ExperienceLevel,
} from "@/lib/events/experience-levels";
import {
  addingCriteriaTotal,
  sumAddingCriteriaMaxima,
} from "@/lib/judging/criteria";
import {
  sheetGaps,
  sheetLevels,
  type OfferedSheets,
} from "@/lib/judging/sheet-criteria";

import { mandatoryTechniqueLabel, SheetCriteriaView } from "./criteria-sheet";
import type {
  EventSubmodalityCriterionRow,
  EventSubmodalityRow,
} from "./shared";

const lockedCriteriaCopy =
  "Esta submodalidad ya tiene puntajes, así que sus criterios no se pueden cambiar.";

type SubmodalityCriteriaDialogProps = {
  criteria: EventSubmodalityCriterionRow[];
  locked?: boolean;
  modalityId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  sheets: OfferedSheets;
  submodality: EventSubmodalityRow;
};

/** The sheet being edited: a level, or null for the general criteria. */
type OpenSheet = { experienceLevel: ExperienceLevel | null };

/**
 * Where a submodality's scoring sheets are defined. Every sheet is the general
 * criteria (`Técnico obligatorio`) plus one level's own, so the dialog opens on
 * the list of them with each one's total, and edits one at a time: the general
 * criteria, or a level's. The list is what tells the administrator which sheets
 * still miss 100 after a change to the general ones, which reach every level.
 */
export function SubmodalityCriteriaDialog({
  criteria,
  locked = false,
  modalityId,
  onOpenChange,
  open,
  sheets,
  submodality,
}: SubmodalityCriteriaDialogProps) {
  const [openSheet, setOpenSheet] = useState<OpenSheet | null>(null);
  // The open sheet holds the draft, so closing the dialog over it asks there.
  const requestCloseRef = useRef<(() => void) | null>(null);
  const close = () => {
    setOpenSheet(null);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          onOpenChange(true);
        } else {
          (requestCloseRef.current ?? close)();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{`Criterios de ${submodality.name}`}</DialogTitle>
          <DialogDescription>
            Cada planilla suma el técnico obligatorio y los criterios de su
            nivel, y tiene que llegar a 100.
          </DialogDescription>
        </DialogHeader>
        {locked ? (
          <Alert variant="info">
            <Info aria-hidden="true" />
            <AlertTitle>Criterios bloqueados</AlertTitle>
            <AlertDescription>{lockedCriteriaCopy}</AlertDescription>
          </Alert>
        ) : null}
        {openSheet ? (
          <SheetCriteriaView
            criteria={criteria}
            experienceLevel={openSheet.experienceLevel}
            key={openSheet.experienceLevel ?? "general"}
            locked={locked}
            modalityId={modalityId}
            onBack={() => setOpenSheet(null)}
            onClose={close}
            requestCloseRef={requestCloseRef}
            sheets={sheets}
            submodalityId={submodality.id}
          />
        ) : (
          <SheetList
            criteria={criteria}
            onOpen={(experienceLevel) => setOpenSheet({ experienceLevel })}
            sheets={sheets}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The submodality's sheets as saved, each with its adding total. A level's
 * total counts the general criteria too, since that is the sheet a judge
 * fills; a level no category offers any more is still listed while it has
 * criteria, so they can be cleared.
 */
function SheetList({
  criteria,
  onOpen,
  sheets,
}: {
  criteria: EventSubmodalityCriterionRow[];
  onOpen: (experienceLevel: ExperienceLevel | null) => void;
  sheets: OfferedSheets;
}) {
  const general = criteria.filter(
    (criterion) => criterion.experienceLevel === null,
  );
  // A level no category offers any more is still a sheet while it has
  // criteria, so its total is checked like the others.
  const levels = sheetLevels(criteria, sheets);
  const gaps = sheetGaps(criteria, { ...sheets, levels });
  const isGap = (experienceLevel: ExperienceLevel | null) =>
    gaps.some((gap) => gap.experienceLevel === experienceLevel);

  return (
    <div className="flex flex-col gap-4">
      {gaps.length > 0 ? (
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Planillas incompletas</AlertTitle>
          <AlertDescription>
            Corregí los criterios de las planillas listadas más abajo.
          </AlertDescription>
        </Alert>
      ) : null}
      <SheetGroup title="Criterios generales">
        <SheetRow
          count={general.length}
          incomplete={isGap(null)}
          onOpen={() => onOpen(null)}
          title={mandatoryTechniqueLabel}
          total={general.length > 0 ? sumAddingCriteriaMaxima(general) : null}
        />
      </SheetGroup>
      {levels.length > 0 ? (
        <SheetGroup title="Criterios por nivel">
          {levels.map((level) => {
            const own = criteria.filter(
              (criterion) => criterion.experienceLevel === level,
            );

            return (
              <SheetRow
                count={own.length}
                incomplete={isGap(level)}
                key={level}
                onOpen={() => onOpen(level)}
                title={experienceLevelLabel(level) ?? level}
                total={
                  general.length + own.length > 0
                    ? sumAddingCriteriaMaxima([...general, ...own])
                    : null
                }
              />
            );
          })}
        </SheetGroup>
      ) : null}
    </div>
  );
}

function SheetGroup({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function SheetRow({
  count,
  incomplete,
  onOpen,
  title,
  total,
}: {
  count: number;
  incomplete: boolean;
  onOpen: () => void;
  title: string;
  /** Null on a sheet with no criteria at all, scored with a single value. */
  total: number | null;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-auto w-full justify-between py-3 text-left"
      data-sheet-row
      onClick={onOpen}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="font-medium" data-sheet-row-part>
          {title}
        </span>
        <Badge data-sheet-row-part variant="secondary">
          {count === 1 ? "1 criterio" : `${count} criterios`}
        </Badge>
      </span>
      <span className="flex items-center gap-2">
        {total === null ? null : (
          <Badge
            data-sheet-row-part
            variant={incomplete ? "warning" : "success"}
          >
            {`${total}/${addingCriteriaTotal}`}
          </Badge>
        )}
        <ChevronRight aria-hidden="true" />
      </span>
    </Button>
  );
}
