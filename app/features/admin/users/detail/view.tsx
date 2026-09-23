import { useState } from "react";
import { Form, Link } from "react-router";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
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
  type DetailViewActionData,
  type UserDetailLoaderData,
} from "@/lib/admin/users/user-detail.shared";
import { SuspendUserDialog } from "@/features/admin/users/detail/suspend-user-dialog";
import { notificationToastIds } from "@/lib/shared/notification-toasts";
import { useServerActionToast } from "@/lib/shared/toasts";

type InternalUserDetailRouteViewProps = {
  actionData?: DetailViewActionData;
  loaderData: UserDetailLoaderData;
};

export function InternalUserDetailRouteView({
  actionData,
  loaderData,
}: InternalUserDetailRouteViewProps) {
  const savedUser = loaderData.user;
  const canManageInternalUser =
    loaderData.canManage && savedUser.userType === "internal";
  const errorData = actionData?.status === "error" ? actionData : undefined;
  const successData = actionData?.status === "success" ? actionData : undefined;
  const isResettingPassword =
    canManageInternalUser &&
    (loaderData.isResettingPassword || errorData?.form === "reset-password");

  useServerActionToast(errorData, {
    toastId: notificationToastIds["user-form-error"],
  });
  useServerActionToast(successData, {
    toastId: "admin-user-detail:success",
  });

  return (
    <AdminResourceLayout
      title="Editar usuario"
      description={getDetailDescription(
        savedUser.userType,
        loaderData.canManage,
      )}
      headerAction={
        canManageInternalUser ? (
          <UserActionsMenu
            resetPasswordHref={loaderData.resetPasswordHref}
            user={savedUser}
          />
        ) : null
      }
      requireSelectedEvent={false}
    >
      <UserDetailBody
        actionData={errorData}
        backToList={loaderData.backToList}
        canManageInternalUser={canManageInternalUser}
        cancelHref={loaderData.cancelHref}
        isResettingPassword={isResettingPassword}
        user={savedUser}
      />
    </AdminResourceLayout>
  );
}

function UserDetailBody({
  actionData,
  backToList,
  canManageInternalUser,
  cancelHref,
  isResettingPassword,
  user,
}: {
  actionData?: DetailActionData;
  backToList: string;
  canManageInternalUser: boolean;
  cancelHref: string;
  isResettingPassword: boolean;
  user: DetailUser;
}) {
  if (user.userType === "academy") {
    return <AcademyUserFormCard backToList={backToList} user={user} />;
  }

  if (isResettingPassword) {
    return (
      <InternalUserResetPasswordCard
        actionData={actionData}
        cancelHref={cancelHref}
      />
    );
  }

  if (canManageInternalUser) {
    return (
      <InternalUserEditCard
        actionData={actionData}
        cancelHref={backToList}
        user={user}
      />
    );
  }

  return <InternalUserDetailCard user={user} />;
}

function UserActionsMenu({
  resetPasswordHref,
  user,
}: {
  resetPasswordHref: string;
  user: DetailUser;
}) {
  // The confirmation lives outside the menu: choosing the item closes the menu,
  // which unmounts everything the menu content holds.
  const [isSuspendDialogOpen, setIsSuspendDialogOpen] = useState(false);

  return (
    <>
      <ResourceActionsMenu contentClassName="w-56">
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to={resetPasswordHref}>Restablecer contraseña</Link>
          </DropdownMenuItem>
          <StatusActionItem
            onSuspend={() => setIsSuspendDialogOpen(true)}
            user={user}
          />
        </DropdownMenuGroup>
      </ResourceActionsMenu>
      <SuspendUserDialog
        open={isSuspendDialogOpen}
        onOpenChange={setIsSuspendDialogOpen}
        userName={user.name}
      />
    </>
  );
}

function StatusActionItem({
  onSuspend,
  user,
}: {
  onSuspend: () => void;
  user: DetailUser;
}) {
  // Reactivation is the undo of a suspension and costs the user nothing, so it
  // stays one click; only the suspension, which closes the sessions at once,
  // asks first.
  if (user.state === "suspended") {
    return (
      <Form method="post">
        <input type="hidden" name="intent" value="reactivate-user" />
        <DropdownMenuItem asChild>
          <button
            type="submit"
            className="w-full justify-start whitespace-nowrap"
          >
            Reactivar usuario
          </button>
        </DropdownMenuItem>
      </Form>
    );
  }

  return (
    <DropdownMenuItem variant="destructive" onSelect={onSuspend}>
      Suspender usuario
    </DropdownMenuItem>
  );
}
