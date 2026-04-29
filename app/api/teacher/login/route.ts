import { NextResponse } from "next/server";

const TEACHER_LOGIN_URL =
  process.env.FLIPEDU_TEACHER_LOGIN_URL ?? "https://teacher.flipedu.net/api/auth/login";

type TeacherLoginPayload = {
  username: string;
  password: string;
  brand: string;
  branch: string;
  type: "ADMIN" | "STUDENT" | "STAFF";
};

type TeacherLoginRequest = TeacherLoginPayload & {
  brandName?: string;
  branchName?: string;
};

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

function encodeSession(session: TeacherSession) {
  return Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
}

function resolvePortalRole(username: string): "admin" | "user" {
  return username.includes("{만능}") ? "admin" : "user";
}

function buildSession(
  payload: TeacherLoginPayload,
  profile: Record<string, unknown> | null,
  metadata: Pick<TeacherLoginRequest, "brandName" | "branchName">
): TeacherSession {
  return {
    username: payload.username,
    brand: payload.brand,
    brandName: metadata.brandName?.trim() || null,
    branch: payload.branch,
    branchName: metadata.branchName?.trim() || null,
    portalRole: resolvePortalRole(payload.username),
    type: payload.type,
    authenticatedAt: new Date().toISOString(),
    profile
  };
}

function buildErrorMessage(status: number, payload: unknown) {
  if (payload && typeof payload === "object") {
    const message = (payload as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message;
  }

  if (status === 401) return "로그인 정보가 올바르지 않습니다.";
  if (status === 403) return "접근 권한이 없습니다.";
  return "teacher 로그인 요청에 실패했습니다.";
}

export async function POST(request: Request) {
  let body: Partial<TeacherLoginRequest> = {};

  try {
    body = (await request.json()) as Partial<TeacherLoginRequest>;
  } catch {
    return NextResponse.json({ message: "로그인 요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const payload: TeacherLoginPayload = {
    username: String(body.username ?? "").trim(),
    password: String(body.password ?? ""),
    brand: String(body.brand ?? "").trim(),
    branch: String(body.branch ?? "").trim(),
    type: body.type === "ADMIN" || body.type === "STUDENT" ? body.type : "STAFF"
  };

  if (!payload.username || !payload.password || !payload.brand || !payload.branch) {
    return NextResponse.json(
      { message: "username, password, brand, branch 값을 모두 입력해 주세요." },
      { status: 400 }
    );
  }

  let upstreamResponse: Response;

  try {
    upstreamResponse = await fetch(TEACHER_LOGIN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        Origin: "https://teacher.flipedu.net",
        Referer: "https://teacher.flipedu.net/"
      },
      body: JSON.stringify(payload),
      cache: "no-store"
    });
  } catch {
    return NextResponse.json(
      { message: "teacher 로그인 서버에 연결하지 못했습니다." },
      { status: 502 }
    );
  }

  const contentType = upstreamResponse.headers.get("content-type") ?? "";
  let upstreamPayload: unknown = null;

  try {
    upstreamPayload = contentType.includes("application/json")
      ? await upstreamResponse.json()
      : await upstreamResponse.text();
  } catch {
    upstreamPayload = null;
  }

  const token = upstreamResponse.headers.get("x-auth-token");

  if (!upstreamResponse.ok || !token) {
    return NextResponse.json(
      { message: buildErrorMessage(upstreamResponse.status, upstreamPayload) },
      { status: upstreamResponse.ok ? 502 : upstreamResponse.status }
    );
  }

  const profile =
    upstreamPayload && typeof upstreamPayload === "object" && !Array.isArray(upstreamPayload)
      ? (upstreamPayload as Record<string, unknown>)
      : null;

  const session = buildSession(payload, profile, {
    brandName: body.brandName,
    branchName: body.branchName
  });
  const response = NextResponse.json({ ok: true, session });

  response.cookies.set({
    name: "flipedu_teacher_token",
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12
  });

  response.cookies.set({
    name: "flipedu_teacher_session",
    value: encodeSession(session),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12
  });

  return response;
}
