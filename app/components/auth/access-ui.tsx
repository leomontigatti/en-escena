import type { ComponentProps, ReactNode } from "react";
import {
  CircleAlert,
  CircleCheck,
  Info,
  LogOut,
  TriangleAlert,
} from "lucide-react";
import { Link } from "react-router";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
          <p className="text-sm leading-5 text-muted-foreground">
            Usuario: {account.username}
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
  variant: AccessNoticeVariant;
};

type AccessNoticeVariant = "error" | "info" | "success" | "warning";

const accessNoticeIcons = {
  error: CircleAlert,
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
} as const;

export function AccessNotice({ children, variant }: AccessNoticeProps) {
  const Icon = accessNoticeIcons[variant];

  return (
    <Alert variant={variant === "error" ? "destructive" : variant}>
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
