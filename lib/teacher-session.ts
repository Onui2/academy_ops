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
    // Signed format: base64url(json).base64url(hmac) — strip signature for edge-runtime compatibility.
    // HMAC verification happens server-side via readAndVerifyTeacherSession (Node.js only).
    const dotIndex = value.lastIndexOf(".");
    const payloadPart = dotIndex !== -1 ? value.slice(0, dotIndex) : value;
    return JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as TeacherSession;
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
