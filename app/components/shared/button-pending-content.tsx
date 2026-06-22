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
  const icon = isPending ? (
    <LoaderCircle aria-hidden="true" className="animate-spin" data-icon />
  ) : (
    idleIcon
  );
  const label = isPending ? pendingLabel : idleLabel;

  return (
    <>
      {icon}
      {label}
    </>
  );
}
