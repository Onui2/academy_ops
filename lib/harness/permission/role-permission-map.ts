import type { AppRole, PermissionAction } from "@/types/user-role";
import type { UserRole } from "@/types/ops";

const rolePermissionMap: Record<AppRole, PermissionAction[]> = {
  USER: ["request:create", "request:list", "request:read", "request:comment", "request:cancel"],
  STAFF: ["request:list", "request:read", "request:comment", "request:status:update"],
  MANAGER: ["request:list", "request:read", "request:comment", "request:status:update", "dashboard:read"],
  ADMIN: ["request:create", "request:list", "request:read", "request:comment", "request:status:update", "request:cancel", "dashboard:read", "audit:read"]
};

export function getRolePermissions(role: AppRole) {
  return rolePermissionMap[role];
}

export function hasRolePermission(role: AppRole, action: PermissionAction) {
  return rolePermissionMap[role].includes(action);
}

export function mapLegacyRoleToAppRole(role: UserRole): AppRole {
  if (role === "super_admin") return "ADMIN";
  if (role === "executive" || role === "academy_admin") return "MANAGER";
  if (role === "nas_admin") return "STAFF";
  return "USER";
}
