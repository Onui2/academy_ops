import { verifySessionPayload } from "@/lib/session-crypto";
import type { TeacherSession } from "@/lib/teacher-session";

export function readAndVerifyTeacherSession(cookieHeader: string | null): TeacherSession | null {
  const sessionCookie = cookieHeader
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("flipedu_teacher_session="))
    ?.slice("flipedu_teacher_session=".length);

  if (!sessionCookie) return null;

  const payload = verifySessionPayload(sessionCookie);
  if (!payload) return null;

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TeacherSession;
  } catch {
    return null;
  }
}
