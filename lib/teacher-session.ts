export type TeacherPortalRole = "admin" | "user";

export type TeacherSession = {
  username: string;
  brand: string;
  brandName: string | null;
  branch: string;
  branchName: string | null;
  portalRole: TeacherPortalRole;
  type: "STAFF";
  authenticatedAt: string;
  profile: Record<string, unknown> | null;
};

function decodeSession(value: string): TeacherSession | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as TeacherSession;
  } catch {
    return null;
  }
}

export function readTeacherSessionFromCookieHeader(cookieHeader: string | null): TeacherSession | null {
  const sessionCookie = cookieHeader
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("flipedu_teacher_session="))
    ?.slice("flipedu_teacher_session=".length);

  if (!sessionCookie) return null;
  return decodeSession(sessionCookie);
}
