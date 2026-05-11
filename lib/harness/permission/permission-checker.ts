import { hasRolePermission } from "@/lib/harness/permission/role-permission-map";
import type { AuthenticatedActor, PermissionAction } from "@/types/user-role";
import type { RequestWorkflowStatus } from "@/types/workflow";

export type RequestPermissionSubject = {
  requestNo: string;
  requesterUserId: string | null;
  requesterUsername: string | null;
  branchId: string | null;
  brandId: string | null;
  assignedUserId: string | null;
  workflowStatus: RequestWorkflowStatus;
};

function isOwner(actor: AuthenticatedActor, subject: RequestPermissionSubject) {
  return !!actor.username && !!subject.requesterUsername && actor.username === subject.requesterUsername && actor.branchId === subject.branchId && actor.brandId === subject.brandId;
}

export function canPerformAction(actor: AuthenticatedActor, action: PermissionAction, subject?: RequestPermissionSubject) {
  if (!hasRolePermission(actor.appRole, action)) {
    return false;
  }

  if (!subject) {
    return true;
  }

  if (actor.appRole === "ADMIN") {
    return true;
  }

  if (action === "request:read" || action === "request:comment") {
    return isOwner(actor, subject) || actor.actorUserId === subject.assignedUserId;
  }

  if (action === "request:status:update") {
    if (actor.appRole === "MANAGER" || actor.appRole === "STAFF") {
      return actor.actorUserId === subject.assignedUserId || actor.branchId === subject.branchId;
    }

    return false;
  }

  if (action === "request:cancel") {
    return isOwner(actor, subject) && (subject.workflowStatus === "SUBMITTED" || subject.workflowStatus === "TRIAGED");
  }

  return isOwner(actor, subject);
}
