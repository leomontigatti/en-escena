import type { ComponentProps, ReactNode } from "react";
import { LogOut } from "lucide-react";
import { Link } from "react-router";

import { alertVariantIcons } from "@/components/shared/alert-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  getInternalAccountInitials,
  type InternalAccount,
} from "@/lib/auth/internal-account";
import { cn } from "@/lib/shared/utils";

const accessTextLinkClassName =
  "rounded-sm font-medium text-brand underline-offset-4 hover:text-brand/80 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

type AccessPageProps = {
  children: ReactNode;
  /** `2xl` is for a panel without the admin's sidebar, laid out for a laptop. */
  width?: "md" | "lg" | "xl" | "2xl";
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
            width === "2xl" && "max-w-6xl",
          )}
        >
          {children}
        </section>
      </main>
    </>
  );
}

type AccessHeaderProps = {
  /** A control kept on the title's line, at its end. */
  action?: ReactNode;
  className?: string;
  eyebrow?: string;
  media?: ReactNode;
  title: string;
  /** `h2` on a private panel's page, as on the admin's; `h1` on the public forms. */
  titleLevel?: 1 | 2;
  description?: ReactNode;
  /** A control kept on the description's line, at its end. */
  descriptionAction?: ReactNode;
  tone?: "default" | "danger";
};

export function AccessHeader({
  action,
  className,
  descriptionAction,
  eyebrow,
  media,
  title,
  titleLevel = 1,
  description,
  tone = "default",
}: AccessHeaderProps) {
  const Title = titleLevel === 1 ? "h1" : "h2";
  // A panel's title sits on its description as the admin's does.
  const descriptionSpacing = titleLevel === 1 ? "mt-4" : "mt-1";
  const descriptionClassName =
    "text-sm leading-6 text-pretty text-muted-foreground";

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
      <div className="mt-3 flex items-center justify-between gap-4">
        <Title
          className={cn(
            "font-semibold text-pretty text-foreground",
            titleLevel === 1 ? "text-3xl" : "text-xl",
          )}
        >
          {title}
        </Title>
        {action}
      </div>
      {description && descriptionAction ? (
        <div
          className={cn(
            "flex items-center justify-between gap-4",
            descriptionSpacing,
          )}
        >
          <p className={descriptionClassName}>{description}</p>
          {descriptionAction}
        </div>
      ) : description ? (
        <p className={cn(descriptionClassName, descriptionSpacing)}>
          {description}
        </p>
      ) : null}
    </header>
  );
}

type PrivateAccessHeaderProps = {
  account: InternalAccount;
};

export function PrivateAccessHeader({ account }: PrivateAccessHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <Avatar shape="square">
          <AvatarFallback className="bg-primary text-primary-foreground">
            {getInternalAccountInitials(account.name)}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-semibold text-foreground">
            {account.name}
          </p>
          <p className="text-sm leading-5 text-muted-foreground">
            {account.roleLabel}
          </p>
        </div>
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
  title: string;
  variant: AccessNoticeVariant;
};

type AccessNoticeVariant = "error" | "info" | "success" | "warning";

export function AccessNotice({ children, title, variant }: AccessNoticeProps) {
  const alertVariant = variant === "error" ? "destructive" : variant;
  const Icon = alertVariantIcons[alertVariant];

  return (
    <Alert variant={alertVariant}>
      <Icon aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
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
