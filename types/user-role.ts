import type { TeacherPortalRole } from "@/lib/teacher-session";
import type { UserRole as LegacyUserRole } from "@/types/ops";

export type AppRole = "USER" | "STAFF" | "MANAGER" | "ADMIN";

export type AuthenticatedActor = {
  actorUserId: string;
  actorName: string;
  appRole: AppRole;
  legacyRole: LegacyUserRole | null;
  portalRole: TeacherPortalRole | null;
  username: string | null;
  branchId: string | null;
  branchName: string | null;
  brandId: string | null;
  brandName: string | null;
  isAdmin: boolean;
};

export type PermissionAction =
  | "request:create"
  | "request:list"
  | "request:read"
  | "request:comment"
  | "request:status:update"
  | "request:cancel"
  | "dashboard:read"
  | "audit:read";
