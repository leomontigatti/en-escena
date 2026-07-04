import { Link } from "react-router";

import { SubmitButton } from "@/components/shared/action-buttons";
import { Button } from "@/components/ui/button";
import {
  isRouteFormPending,
  type RouteFormPendingScope,
  useOptionalNavigation,
} from "@/lib/shared/forms";
import { buildListPath } from "@/lib/shared/navigation";

function EventBasesFormActions({
  basePath,
  className = "flex justify-end gap-2",
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
      <Button asChild variant="outline">
        <Link to={buildListPath(basePath, null)}>Volver</Link>
      </Button>
      <SubmitButton form={formId} isPending={isPending} />
    </div>
  );
}

export { EventBasesFormActions };
