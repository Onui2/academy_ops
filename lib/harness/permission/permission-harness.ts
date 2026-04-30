import { HarnessError } from "@/lib/harness/harness-error";
import { canPerformAction, type RequestPermissionSubject } from "@/lib/harness/permission/permission-checker";
import type { AuthenticatedActor, PermissionAction } from "@/types/user-role";

export function ensurePermission(
  actor: AuthenticatedActor,
  action: PermissionAction,
  subject?: RequestPermissionSubject,
  exposeMessage = "접근 권한이 없습니다."
) {
  if (canPerformAction(actor, action, subject)) {
    return;
  }

  throw new HarnessError(`Permission denied for ${action}.`, 403, exposeMessage);
}
