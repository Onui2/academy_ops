import { HarnessError } from "@/lib/harness/harness-error";
import { readTeacherSessionFromCookieHeader } from "@/lib/teacher-session";
import type { AuthenticatedActor, AppRole } from "@/types/user-role";

function resolveActorName(profile: Record<string, unknown> | null, username: string) {
  const raw = typeof profile?.name === "string" && profile.name.trim() ? profile.name.trim() : username;
  return raw || "Internal User";
}

function resolveAppRole(portalRole: "admin" | "user"): AppRole {
  return portalRole === "admin" ? "ADMIN" : "USER";
}

export function requireAuthenticatedActor(request: Request): AuthenticatedActor {
  const session = readTeacherSessionFromCookieHeader(request.headers.get("cookie"));
  if (!session) {
    throw new HarnessError("Unauthenticated request.", 401, "로그인이 필요합니다.");
  }

  const appRole = resolveAppRole(session.portalRole);
  return {
    actorUserId: `teacher:${session.brand}:${session.branch}:${session.username}`,
    actorName: resolveActorName(session.profile, session.username),
    appRole,
    legacyRole: null,
    portalRole: session.portalRole,
    username: session.username,
    branchId: session.branch,
    branchName: session.branchName,
    brandId: session.brand,
    brandName: session.brandName,
    isAdmin: appRole === "ADMIN"
  };
}

export function getRequestAuditContext(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");

  return {
    ipAddress: forwardedFor?.split(",")[0]?.trim() ?? realIp ?? null,
    userAgent: request.headers.get("user-agent")
  };
}
