import type { ComponentProps, ReactNode } from "react";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";

type SharedFieldOrientation = ComponentProps<typeof Field>["orientation"];

type SharedFieldLayoutRenderProps = {
  describedBy?: string;
  errorId: string;
  isInvalid: boolean;
};

type SharedFieldLayoutProps = {
  children: (props: SharedFieldLayoutRenderProps) => ReactNode;
  className?: string;
  contentClassName?: string;
  description?: ReactNode;
  descriptionPlacement?: "before-control" | "after-control";
  disabled?: boolean;
  error?: ReactNode;
  errorClassName?: string;
  id: string;
  label: ReactNode;
  labelClassName?: string;
  orientation?: SharedFieldOrientation;
};

function SharedFieldLayout({
  children,
  className,
  contentClassName,
  description,
  descriptionPlacement = "before-control",
  disabled = false,
  error,
  errorClassName,
  id,
  label,
  labelClassName,
  orientation,
}: SharedFieldLayoutProps) {
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = `${id}-error`;
  const isInvalid = Boolean(error);
  const describedBy = getDescribedBy([
    descriptionId,
    isInvalid ? errorId : undefined,
  ]);
  const descriptionNode = getDescriptionNode({
    description,
    descriptionId,
  });

  return (
    <Field
      className={className}
      data-disabled={dataFlag(disabled)}
      data-invalid={dataFlag(isInvalid)}
      orientation={orientation}
    >
      <FieldLabel htmlFor={id} className={labelClassName}>
        {label}
      </FieldLabel>
      <FieldContent className={contentClassName}>
        <FieldDescriptionSlot
          descriptionNode={descriptionNode}
          placement={descriptionPlacement}
          slot="before-control"
        />
        {children({ describedBy, errorId, isInvalid })}
        <FieldDescriptionSlot
          descriptionNode={descriptionNode}
          placement={descriptionPlacement}
          slot="after-control"
        />
        <FieldError id={errorId} className={errorClassName}>
          {error}
        </FieldError>
      </FieldContent>
    </Field>
  );
}

function dataFlag(value: boolean) {
  return value ? true : undefined;
}

function getDescribedBy(ids: Array<string | undefined>) {
  return ids.filter(Boolean).join(" ") || undefined;
}

function getDescriptionNode({
  description,
  descriptionId,
}: {
  description?: ReactNode;
  descriptionId?: string;
}) {
  if (!description) {
    return null;
  }

  return <FieldDescription id={descriptionId}>{description}</FieldDescription>;
}

function FieldDescriptionSlot({
  descriptionNode,
  placement,
  slot,
}: {
  descriptionNode: ReactNode;
  placement: NonNullable<SharedFieldLayoutProps["descriptionPlacement"]>;
  slot: NonNullable<SharedFieldLayoutProps["descriptionPlacement"]>;
}) {
  if (placement !== slot) {
    return null;
  }

  return descriptionNode;
}

export { SharedFieldLayout, type SharedFieldOrientation };
