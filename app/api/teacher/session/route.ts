import { NextResponse } from "next/server";
import { readAndVerifyTeacherSession } from "@/lib/server-teacher-session";

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
  const cookieHeader = request.headers.get("cookie");

  const tokenCookie = cookieHeader
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("flipedu_teacher_token="))
    ?.slice("flipedu_teacher_token=".length);

  if (!tokenCookie) {
    return NextResponse.json({ message: "로그인 세션이 없습니다." }, { status: 401 });
  }

  const session = readAndVerifyTeacherSession(cookieHeader);
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
