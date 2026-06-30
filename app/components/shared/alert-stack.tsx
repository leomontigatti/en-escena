import { Children, type ReactNode } from "react";

export function AlertStack({ children }: { children: ReactNode }) {
  const alerts = Children.toArray(children);

  if (alerts.length === 0) {
    return null;
  }

  return <div className="flex flex-col gap-3">{alerts}</div>;
}
