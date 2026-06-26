import { Check, LoaderCircle } from "lucide-react";
import { Form, Link } from "react-router";

import { MultiComboboxField } from "@/components/shared/multi-combobox-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  FieldDescription,
  FieldError,
  FieldGroup,
} from "@/components/ui/field";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import {
  ChoreographySelectPreviewField,
  ReadonlyDetailField,
} from "@/features/portal/choreographies/detail/roster-editor-fields";
import {
  type ChoreographyRosterEditorActionData,
  type ChoreographyRosterEditorLoaderData,
  updateChoreographyIntent,
} from "@/features/portal/choreographies/detail/roster-editor.shared";
import { useChoreographyRosterEditorForm } from "@/features/portal/choreographies/detail/use-choreography-roster-editor-form";

export function ChoreographyRosterEditorForm({
  actionData,
  loaderData,
}: {
  actionData: ChoreographyRosterEditorActionData;
  loaderData: ChoreographyRosterEditorLoaderData;
}) {
  const choreography = loaderData.choreography;
  const editor = useChoreographyRosterEditorForm({ actionData, loaderData });
  const {
    canEditDancers,
    canEditProfessors,
    canSubmit,
    dancerOptions,
    derivedResolution,
    experienceLevelFieldId,
    experienceLevelOptions,
    form,
    handleSubmit,
    hasResolvedRosterChange,
    isResolving,
    isSubmitting,
    professorOptions,
    readonlyExperienceLevelName,
    readonlyScheduleLabel,
    scheduleFieldId,
    scheduleResolution,
    scheduleSelectOptions,
  } = editor;

  return (
    <Form method="post" onSubmit={handleSubmit}>
      <Card>
        <CardContent className="flex flex-col gap-5">
          <input type="hidden" name="intent" value={updateChoreographyIntent} />

          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <ReadonlyDetailField
              className="md:col-span-2"
              label="Nombre"
              value={choreography.name}
            />
            <ReadonlyDetailField
              label="Modalidad"
              value={choreography.modalityName}
            />
            <ReadonlyDetailField
              label="Submodalidad"
              value={choreography.submodalityName ?? ""}
            />
            <ReadonlyDetailField
              label="Categoría"
              value={derivedResolution.categoryName ?? "Sin asignar"}
            />
            <ReadonlyDetailField
              label="Tipo de grupo"
              value={formatGroupTypeLabel(derivedResolution.groupType)}
            />
            {hasResolvedRosterChange &&
            derivedResolution.experienceLevelRequired ? (
              <ChoreographySelectPreviewField
                control={form.control}
                fieldName="experienceLevelId"
                id={experienceLevelFieldId}
                label="Nivel de experiencia"
                options={experienceLevelOptions}
              />
            ) : (
              <ReadonlyDetailField
                label="Nivel de experiencia"
                value={readonlyExperienceLevelName}
              />
            )}
            {hasResolvedRosterChange &&
            scheduleResolution?.status === "multiple" ? (
              <ChoreographySelectPreviewField
                control={form.control}
                fieldName="scheduleCapacityId"
                id={scheduleFieldId}
                label="Cupo de cronograma"
                options={scheduleSelectOptions}
              />
            ) : (
              <ReadonlyDetailField
                label="Cupo de cronograma"
                value={readonlyScheduleLabel}
              />
            )}
          </FieldGroup>

          <FieldGroup>
            <MultiComboboxField
              control={form.control}
              disabled={!canEditDancers}
              emptyMessage="Sin bailarines disponibles"
              inputName="dancerIds"
              label="Bailarines"
              name="dancerIds"
              options={dancerOptions}
              placeholder="Buscar bailarines"
              searchable={true}
            />
            {!canEditDancers ? (
              <FieldDescription>
                {loaderData.dancerEditingEligibility.reasonText}
              </FieldDescription>
            ) : null}

            <MultiComboboxField
              control={form.control}
              disabled={!canEditProfessors}
              emptyMessage="Sin profesores disponibles"
              inputName="professorIds"
              label="Profesores"
              name="professorIds"
              options={professorOptions}
              placeholder="Buscar profesores"
              searchable={true}
            />
            {!canEditProfessors ? (
              <FieldDescription>
                No podés editar profesores porque la coreografía ya tiene una
                presentación asociada.
              </FieldDescription>
            ) : null}
            {actionData?.status === "update-error" ? (
              <FieldError>{actionData.message}</FieldError>
            ) : null}
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end gap-3 border-0 bg-transparent pt-0">
          <Button asChild variant="outline" size="lg">
            <Link to="/portal/coreografias">Volver</Link>
          </Button>
          <Button type="submit" size="lg" disabled={!canSubmit}>
            {isResolving || isSubmitting ? (
              <LoaderCircle
                aria-hidden="true"
                className="animate-spin"
                data-icon="inline-start"
              />
            ) : (
              <Check aria-hidden="true" data-icon="inline-start" />
            )}
            Guardar coreografía
          </Button>
        </CardFooter>
      </Card>
    </Form>
  );
}
