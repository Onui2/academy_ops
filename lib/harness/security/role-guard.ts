import { HarnessError } from "@/lib/harness/harness-error";
import { mapLegacyRoleToAppRole } from "@/lib/harness/permission/role-permission-map";
import type { UserRole as LegacyUserRole } from "@/types/ops";
import type { AppRole, AuthenticatedActor } from "@/types/user-role";

export function ensureRole(actor: AuthenticatedActor, allowed: AppRole[], exposeMessage = "접근 권한이 없습니다.") {
  if (allowed.includes(actor.appRole)) return;
  throw new HarnessError(`Role ${actor.appRole} is not allowed for this action.`, 403, exposeMessage);
}

function normalizeRoleValue(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function resolveLegacyRoleFromProfile(
  profile: Record<string, unknown> | null | undefined,
  portalRole: "admin" | "user"
): LegacyUserRole | null {
  if (portalRole === "admin") {
    return "super_admin";
  }

  const raw = normalizeRoleValue(profile?.role);
  if (!raw) return "general";

  if (raw === "super_admin") return "super_admin";
  if (raw === "executive" || raw === "manager") return "executive";
  if (raw === "academy_admin" || raw === "branch_admin" || raw === "admin" || raw === "administrator") {
    return "academy_admin";
  }
  if (raw === "nas_admin" || raw === "staff" || raw === "operator" || raw === "support") {
    return "nas_admin";
  }

  return "general";
}

export function resolveAppRoleFromProfile(
  profile: Record<string, unknown> | null | undefined,
  portalRole: "admin" | "user"
): AppRole {
  if (portalRole === "admin") {
    return "ADMIN";
  }

  const raw = normalizeRoleValue(profile?.role);
  if (raw === "admin" || raw === "administrator") return "ADMIN";
  if (raw === "manager") return "MANAGER";
  if (raw === "staff" || raw === "operator" || raw === "support") return "STAFF";

  const legacyRole = resolveLegacyRoleFromProfile(profile, portalRole);
  return legacyRole ? mapLegacyRoleToAppRole(legacyRole) : "USER";
}
