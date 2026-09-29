import {
  useFormState,
  type FieldValues,
  type UseFormReturn,
} from "react-hook-form";

import { FormActions } from "@/components/shared/form-actions";
import {
  isRouteFormPending,
  type RouteFormPendingScope,
  useOptionalNavigation,
} from "@/lib/shared/forms";
import { buildListPath } from "@/lib/shared/navigation";

function EventBasesFormActions<TFieldValues extends FieldValues>({
  basePath,
  form,
  formId,
  pendingScope,
}: {
  basePath: string;
  form: UseFormReturn<TFieldValues>;
  formId: string;
  pendingScope: RouteFormPendingScope;
}) {
  const navigation = useOptionalNavigation();
  const { isDirty } = useFormState({ control: form.control });

  return (
    <FormActions
      backTo={buildListPath(basePath, null)}
      form={formId}
      hasChanges={isDirty}
      isPending={isRouteFormPending(navigation, pendingScope)}
      onDiscard={() => form.reset()}
    />
  );
}

export { EventBasesFormActions };
