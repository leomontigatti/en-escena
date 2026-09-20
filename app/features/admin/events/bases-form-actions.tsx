import { useFormState, type Control, type FieldValues } from "react-hook-form";

import { BackButton, SubmitButton } from "@/components/shared/action-buttons";
import {
  isRouteFormPending,
  type RouteFormPendingScope,
  useOptionalNavigation,
} from "@/lib/shared/forms";
import { buildListPath } from "@/lib/shared/navigation";

function EventBasesFormActions<TFieldValues extends FieldValues>({
  basePath,
  className = "flex items-center justify-between gap-2",
  control,
  formId,
  pendingScope,
}: {
  basePath: string;
  className?: string;
  control: Control<TFieldValues>;
  formId: string;
  pendingScope: RouteFormPendingScope;
}) {
  const navigation = useOptionalNavigation();
  const isPending = isRouteFormPending(navigation, pendingScope);
  // Nothing changed is nothing to save: the button only wakes up once the form
  // is dirty, so a save is always a save of something.
  const { isDirty } = useFormState({ control });

  return (
    <div className={className}>
      <BackButton to={buildListPath(basePath, null)} />
      <SubmitButton disabled={!isDirty} form={formId} isPending={isPending} />
    </div>
  );
}

export { EventBasesFormActions };
