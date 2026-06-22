import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

type ButtonPendingContentProps = {
  isPending: boolean;
  pendingLabel: string;
  idleLabel: string;
  idleIcon?: ReactNode;
};

export function ButtonPendingContent({
  isPending,
  pendingLabel,
  idleLabel,
  idleIcon,
}: ButtonPendingContentProps) {
  return (
    <>
      {isPending ? (
        <LoaderCircle aria-hidden="true" className="animate-spin" data-icon />
      ) : (
        idleIcon
      )}
      {isPending ? pendingLabel : idleLabel}
    </>
  );
}
