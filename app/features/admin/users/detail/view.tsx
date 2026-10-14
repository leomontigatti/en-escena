import { useEffect, useState } from "react";
import { Form } from "react-router";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { SuspendUserDialog } from "@/components/shared/suspend-user-dialog";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AcademyUserFormCard,
  InternalUserDetailCard,
} from "@/lib/admin/users/user-detail-cards";
import { InternalUserEditCard } from "@/lib/admin/users/user-detail-edit-form";
import { InternalUserResetPasswordDialog } from "@/lib/admin/users/user-detail-password-reset-form";
import {
  getDetailDescription,
  type DetailActionData,
  type DetailSuccessData,
  type DetailUser,
  reactivateUserIntent,
  type DetailViewActionData,
} from "@/lib/admin/users/user-detail.shared";
import { notificationToastIds } from "@/lib/shared/notification-toasts";
import { useServerActionToast } from "@/lib/shared/toasts";

import { IndividualLinkReviewBadge } from "../individual-link-badge";
import { UserAccessStateBadge } from "../user-access-state-badge";

import {
  IndividualDataCard,
  IndividualLinkActions,
  IndividualLinkAlert,
} from "./individual/view";
import type { IndividualLinkDetail } from "./individual/shared";
import type { UserDetailRouteLoaderData } from "./shared";

type InternalUserDetailRouteViewProps = {
  actionData?: DetailViewActionData;
  loaderData: UserDetailRouteLoaderData;
};

export function InternalUserDetailRouteView({
  actionData,
  loaderData,
}: InternalUserDetailRouteViewProps) {
  const savedUser = loaderData.user;
  const { individual } = loaderData;
  const canManageInternalUser =
    loaderData.canWrite && savedUser.userType === "internal";
  const errorData = actionData?.status === "error" ? actionData : undefined;
  const successData = actionData?.status === "success" ? actionData : undefined;

  useServerActionToast(errorData, {
    toastId: notificationToastIds["user-form-error"],
  });
  useServerActionToast(successData, {
    toastId: "admin-user-detail:success",
  });

  return (
    <AdminResourceLayout
      title={savedUser.name}
      titleBadge={<UserTitleBadges individual={individual} user={savedUser} />}
      description={getDetailDescription(
        savedUser.userType,
        loaderData.canWrite,
      )}
      headerAction={
        canManageInternalUser ? (
          <UserActionsMenu successData={successData} user={savedUser} />
        ) : individual && loaderData.canWrite ? (
          <IndividualLinkActions individual={individual} />
        ) : null
      }
      requireSelectedEvent={false}
    >
      {individual ? (
        <>
          <IndividualLinkAlert individual={individual} />
          <IndividualDataCard
            backToList={loaderData.backToList}
            individual={individual}
          />
        </>
      ) : (
        <UserDetailBody
          actionData={errorData}
          backToList={loaderData.backToList}
          canManageInternalUser={canManageInternalUser}
          user={savedUser}
        />
      )}
    </AdminResourceLayout>
  );
}

/** A suspension, and an individual's link state, beside the name. */
function UserTitleBadges({
  individual,
  user,
}: {
  individual: IndividualLinkDetail | null;
  user: DetailUser;
}) {
  if (user.state !== "suspended" && !individual) {
    return null;
  }

  return (
    <>
      {user.state === "suspended" ? (
        <UserAccessStateBadge state={user.state} />
      ) : null}
      {individual ? (
        <IndividualLinkReviewBadge state={individual.linkState} />
      ) : null}
    </>
  );
}

function UserDetailBody({
  actionData,
  backToList,
  canManageInternalUser,
  user,
}: {
  actionData?: DetailActionData;
  backToList: string;
  canManageInternalUser: boolean;
  user: DetailUser;
}) {
  if (user.userType !== "internal") {
    return <AcademyUserFormCard backToList={backToList} user={user} />;
  }

  if (canManageInternalUser) {
    return (
      <InternalUserEditCard
        actionData={actionData}
        backToList={backToList}
        user={user}
      />
    );
  }

  return <InternalUserDetailCard backToList={backToList} user={user} />;
}

function UserActionsMenu({
  successData,
  user,
}: {
  successData?: DetailSuccessData;
  user: DetailUser;
}) {
  // The confirmation lives outside the menu: choosing the item closes the menu,
  // which unmounts everything the menu content holds.
  const [isSuspendDialogOpen, setIsSuspendDialogOpen] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

  // Neither dialog's action leaves the detail, so nothing unmounts them when it
  // succeeds. Close them on the success result rather than on the submit: a
  // refusal — the last active administrator, oneself, a rejected password — has
  // to leave the dialog standing under its toast. See docs/agents/form-feedback.md.
  useEffect(() => {
    if (successData) {
      setIsSuspendDialogOpen(false);
      setIsResetDialogOpen(false);
    }
  }, [successData]);

  return (
    <>
      <ResourceActionsMenu contentClassName="w-56">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => setIsResetDialogOpen(true)}>
            Restablecer contraseña
          </DropdownMenuItem>
          {user.state === "suspended" ? null : <DropdownMenuSeparator />}
          <StatusActionItem
            onSuspend={() => setIsSuspendDialogOpen(true)}
            user={user}
          />
        </DropdownMenuGroup>
      </ResourceActionsMenu>
      <InternalUserResetPasswordDialog
        onOpenChange={setIsResetDialogOpen}
        open={isResetDialogOpen}
      />
      <SuspendUserDialog
        open={isSuspendDialogOpen}
        onOpenChange={setIsSuspendDialogOpen}
        userName={user.name}
        userRole={user.mainRole}
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
        <input type="hidden" name="intent" value={reactivateUserIntent} />
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
