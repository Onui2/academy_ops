import { NextResponse } from "next/server";

type TeacherSession = {
  username: string;
  brand: string;
  brandName: string | null;
  branch: string;
  branchName: string | null;
  portalRole: "admin" | "user";
  type: "ADMIN" | "STUDENT" | "STAFF";
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

function clearSession(response: NextResponse) {
  response.cookies.set({
    name: "flipedu_teacher_token",
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });

  response.cookies.set({
    name: "flipedu_teacher_session",
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

export async function GET(request: Request) {
  const sessionCookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("flipedu_teacher_session="))
    ?.slice("flipedu_teacher_session=".length);

  const tokenCookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("flipedu_teacher_token="))
    ?.slice("flipedu_teacher_token=".length);

  if (!sessionCookie || !tokenCookie) {
    return NextResponse.json({ message: "로그인 세션이 없습니다." }, { status: 401 });
  }

  const session = decodeSession(sessionCookie);
  if (!session) {
    const response = NextResponse.json({ message: "세션 정보를 읽지 못했습니다." }, { status: 401 });
    clearSession(response);
    return response;
  }

  return NextResponse.json({ authenticated: true, session });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearSession(response);
  return response;
}
