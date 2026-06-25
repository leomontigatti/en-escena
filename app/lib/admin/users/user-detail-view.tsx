import { useServerActionToast } from "@/lib/shared/toasts";
import { Form, Link } from "react-router";

import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  AcademyUserFormCard,
  InternalUserDetailCard,
} from "@/lib/admin/users/user-detail-cards";
import { InternalUserEditCard } from "@/lib/admin/users/user-detail-edit-form";
import { InternalUserResetPasswordCard } from "@/lib/admin/users/user-detail-password-reset-form";
import {
  getDetailDescription,
  type DetailActionData,
  type DetailUser,
  type UserDetailLoaderData,
} from "@/lib/admin/users/user-detail.shared";
import { routeNotificationToastIds } from "@/lib/shared/route-notification-toasts";

type AdministracionUsuarioDetalleRouteViewProps = {
  actionData?: DetailActionData;
  loaderData: UserDetailLoaderData;
};

export function AdministracionUsuarioDetalleRouteView({
  actionData,
  loaderData,
}: AdministracionUsuarioDetalleRouteViewProps) {
  const savedUser = loaderData.user;
  const canManageInternalUser =
    loaderData.canManage && savedUser.userType === "internal";
  const isResettingPassword =
    canManageInternalUser &&
    (loaderData.isResettingPassword || actionData?.form === "reset-password");

  useServerActionToast(actionData, {
    toastId: routeNotificationToastIds["user-form-error"],
  });

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Editar usuario</h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {getDetailDescription(savedUser.userType, loaderData.canManage)}
          </p>
        </div>
        {canManageInternalUser ? (
          <UserActionsMenu
            resetPasswordHref={loaderData.resetPasswordHref}
            user={savedUser}
          />
        ) : null}
      </header>

      {savedUser.userType === "academy" ? (
        <AcademyUserFormCard
          backToList={loaderData.backToList}
          user={savedUser}
        />
      ) : isResettingPassword ? (
        <InternalUserResetPasswordCard
          actionData={actionData}
          cancelHref={loaderData.cancelHref}
        />
      ) : canManageInternalUser ? (
        <InternalUserEditCard
          actionData={actionData}
          cancelHref={loaderData.backToList}
          user={savedUser}
        />
      ) : (
        <InternalUserDetailCard user={savedUser} />
      )}
    </section>
  );
}

function UserActionsMenu({
  resetPasswordHref,
  user,
}: {
  resetPasswordHref: string;
  user: DetailUser;
}) {
  return (
    <ResourceActionsMenu contentClassName="w-56">
      <DropdownMenuGroup>
        <DropdownMenuItem asChild>
          <Link to={resetPasswordHref}>Restablecer contraseña</Link>
        </DropdownMenuItem>
        <StatusActionItem user={user} />
      </DropdownMenuGroup>
    </ResourceActionsMenu>
  );
}

function StatusActionItem({ user }: { user: DetailUser }) {
  const isSuspended = user.state === "suspended";

  return (
    <Form method="post">
      <input
        type="hidden"
        name="intent"
        value={isSuspended ? "reactivate-user" : "suspend-user"}
      />
      <DropdownMenuItem
        asChild
        variant={isSuspended ? undefined : "destructive"}
      >
        <button
          type="submit"
          className="w-full justify-start whitespace-nowrap"
        >
          {isSuspended ? "Reactivar usuario" : "Suspender usuario"}
        </button>
      </DropdownMenuItem>
    </Form>
  );
}
