import type { ComponentProps, ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, LogOut } from "lucide-react";
import { Link } from "react-router";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";

export const accessTextLinkClassName =
  "rounded-sm font-medium text-brand underline-offset-4 hover:text-brand/80 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

type AccessPageProps = {
  children: ReactNode;
  width?: "md" | "lg" | "xl";
};

export function AccessPage({ children, width = "md" }: AccessPageProps) {
  return (
    <>
      <a
        href="#contenido-principal"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:rounded-lg focus-visible:bg-background focus-visible:px-4 focus-visible:py-3 focus-visible:text-sm focus-visible:font-semibold focus-visible:text-foreground focus-visible:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Saltar al contenido principal
      </a>
      <main
        id="contenido-principal"
        className="grid min-h-screen place-items-center overflow-x-hidden bg-muted px-4 py-8 sm:px-6 sm:py-12"
      >
        <section
          className={cn(
            "w-full rounded-lg border bg-card p-6 text-card-foreground shadow-sm sm:p-8",
            width === "md" && "max-w-md",
            width === "lg" && "max-w-lg",
            width === "xl" && "max-w-4xl",
          )}
        >
          {children}
        </section>
      </main>
    </>
  );
}

type AccessHeaderProps = {
  className?: string;
  eyebrow?: string;
  media?: ReactNode;
  title: string;
  description?: ReactNode;
  tone?: "default" | "danger";
};

export function AccessHeader({
  className,
  eyebrow,
  media,
  title,
  description,
  tone = "default",
}: AccessHeaderProps) {
  return (
    <header className={className}>
      {media}
      {eyebrow ? (
        <p
          className={cn(
            "text-sm font-medium",
            tone === "danger" ? "text-destructive" : "text-primary",
          )}
        >
          {eyebrow}
        </p>
      ) : null}
      <h1 className="mt-3 text-3xl font-semibold text-pretty text-foreground">
        {title}
      </h1>
      {description ? (
        <p className="mt-4 text-sm leading-6 text-pretty text-muted-foreground">
          {description}
        </p>
      ) : null}
    </header>
  );
}

type PrivateAccessHeaderProps = {
  email: string;
};

export function PrivateAccessHeader({ email }: PrivateAccessHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-foreground">En Escena</p>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">
          Sesión activa para{" "}
          <span className="break-words font-medium text-foreground">
            {email}
          </span>
        </p>
      </div>
      <form action="/salir" method="post">
        <Button type="submit" variant="outline">
          <LogOut aria-hidden="true" data-icon="inline-start" />
          <span>Salir</span>
        </Button>
      </form>
    </div>
  );
}

type AccessNoticeProps = {
  children: ReactNode;
  variant: AccessNoticeVariant;
};

type AccessNoticeVariant = "error" | "info" | "success";

export function AccessNotice({ children, variant }: AccessNoticeProps) {
  const Icon =
    variant === "error"
      ? CircleAlert
      : variant === "success"
        ? CircleCheck
        : Info;

  return (
    <Alert
      variant={
        variant === "error"
          ? "destructive"
          : variant === "success"
            ? "success"
            : "info"
      }
    >
      <Icon aria-hidden="true" />
      <AlertDescription aria-live="polite">{children}</AlertDescription>
    </Alert>
  );
}

type AccessTextLinkProps = ComponentProps<typeof Link>;

export function AccessTextLink({ className, ...props }: AccessTextLinkProps) {
  return <Link {...props} className={cn(accessTextLinkClassName, className)} />;
}

type AccessSecondaryLinkProps = ComponentProps<typeof Link>;

export function AccessSecondaryLink({
  className,
  ...props
}: AccessSecondaryLinkProps) {
  return (
    <Link
      {...props}
      className={cn(
        buttonVariants({ variant: "outline", size: "lg" }),
        className,
      )}
    />
  );
}
