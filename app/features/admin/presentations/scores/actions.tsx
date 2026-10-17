import { useState } from "react";
import { Link, useNavigation, useSubmit } from "react-router";

import { BlockedActionDialog } from "@/components/shared/blocked-action-dialog";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { choreographyDetailPath } from "@/lib/choreographies/admin-paths";
import { isRouteFormPending } from "@/lib/shared/forms";

import type { PresentationScoresLoaderData } from "./server";

type Presentation = PresentationScoresLoaderData["presentation"];

/**
 * The record's actions: the way to the choreography, and — for administration
 * only — the disqualification. It is rare and pulls the presentation out of the
 * results, so it asks first; reinstating puts back exactly what was there and
 * does not. A withdrawn presentation is never judged: the disqualification
 * stays in the menu and opens `BlockedActionDialog` saying why (style guide,
 * Detail pages), and the server refuses it too.
 */
export function PresentationActions({
  canWrite,
  presentation,
}: {
  canWrite: boolean;
  presentation: Presentation;
}) {
  const submit = useSubmit();
  const navigation = useNavigation();
  // Either way the presentation is mid-change, so neither is offered again
  // until the page has the answer.
  const isSettling =
    isRouteFormPending(navigation, { intent: "disqualify" }) ||
    isRouteFormPending(navigation, { intent: "reinstate" });
  const [isDisqualifyDialogOpen, setIsDisqualifyDialogOpen] = useState(false);
  const [isBlockedDialogOpen, setIsBlockedDialogOpen] = useState(false);
  const submitIntent = (intent: "disqualify" | "reinstate") => {
    void submit({ intent }, { method: "post" });
  };

  return (
    <>
      <ResourceActionsMenu contentClassName="w-48">
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to={choreographyDetailPath(presentation.choreographyId)}>
              Ver la coreografía
            </Link>
          </DropdownMenuItem>
          {canWrite && presentation.disqualified ? (
            <DropdownMenuItem
              disabled={isSettling}
              onSelect={() => submitIntent("reinstate")}
            >
              Volver a calificar
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        {canWrite && !presentation.disqualified ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                disabled={isSettling}
                variant="destructive"
                onSelect={() =>
                  presentation.withdrawn
                    ? setIsBlockedDialogOpen(true)
                    : setIsDisqualifyDialogOpen(true)
                }
              >
                Descalificar
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        ) : null}
      </ResourceActionsMenu>
      <ConfirmationDialog
        confirmLabel="Descalificar"
        description="Queda fuera de los resultados, sin promedio ni premio. Los puntajes guardados se conservan y vuelven si la calificás de nuevo."
        destructive
        onConfirm={() => submitIntent("disqualify")}
        onOpenChange={setIsDisqualifyDialogOpen}
        open={isDisqualifyDialogOpen}
        title="¿Descalificar la presentación?"
      />
      <BlockedActionDialog
        description="Una coreografía retirada no vuelve a participar."
        onOpenChange={setIsBlockedDialogOpen}
        open={isBlockedDialogOpen}
        reasons="Conserva su número en el programa, pero no se presenta ni se juzga."
        reasonsTitle="La coreografía fue retirada"
        title="No se puede descalificar la presentación"
      />
    </>
  );
}
