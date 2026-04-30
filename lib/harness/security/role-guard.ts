import { HarnessError } from "@/lib/harness/harness-error";
import type { AppRole, AuthenticatedActor } from "@/types/user-role";

export function ensureRole(actor: AuthenticatedActor, allowed: AppRole[], exposeMessage = "접근 권한이 없습니다.") {
  if (allowed.includes(actor.appRole)) return;
  throw new HarnessError(`Role ${actor.appRole} is not allowed for this action.`, 403, exposeMessage);
}
