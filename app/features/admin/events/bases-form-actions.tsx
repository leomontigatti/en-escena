import { BackButton, SubmitButton } from "@/components/shared/action-buttons";
import {
  isRouteFormPending,
  type RouteFormPendingScope,
  useOptionalNavigation,
} from "@/lib/shared/forms";
import { buildListPath } from "@/lib/shared/navigation";

function EventBasesFormActions({
  basePath,
  className = "flex items-center justify-between gap-2",
  formId,
  pendingScope,
}: {
  basePath: string;
  className?: string;
  formId: string;
  pendingScope: RouteFormPendingScope;
}) {
  const navigation = useOptionalNavigation();
  const isPending = isRouteFormPending(navigation, pendingScope);

  return (
    <div className={className}>
      <BackButton to={buildListPath(basePath, null)} />
      <SubmitButton form={formId} isPending={isPending} />
    </div>
  );
}

export { EventBasesFormActions };
