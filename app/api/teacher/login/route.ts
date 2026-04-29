import * as CryptoJS from "crypto-js";
import { NextResponse } from "next/server";

const TEACHER_LOGIN_URL =
  process.env.FLIPEDU_TEACHER_LOGIN_URL ?? "https://teacher.flipedu.net/api/auth/login";

const TEACHER_PASSWORD_KEY =
  process.env.FLIPEDU_TEACHER_PASSWORD_KEY ?? "watt-encryption-key-2024-02-26";

type TeacherLoginPayload = {
  username: string;
  password: string;
  sysSeq: string;
  brand: string;
  branch: string;
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
  type: "STAFF";
  authenticatedAt: string;
  profile: Record<string, unknown> | null;
};

function encodeSession(session: TeacherSession) {
  return Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
}

function encryptPassword(password: string) {
  return CryptoJS.AES.encrypt(password, TEACHER_PASSWORD_KEY).toString();
}

function resolvePortalRole(username: string): "admin" | "user" {
  return username.includes("{\uB9CC\uB2A5}") ? "admin" : "user";
}

function buildSession(
  payload: TeacherLoginPayload,
  profile: Record<string, unknown> | null,
  metadata: Pick<TeacherLoginRequest, "brandName" | "branchName">
): TeacherSession {
  const prunedProfile = profile
    ? {
        name: typeof profile.name === "string" ? profile.name : payload.username,
        email: typeof profile.email === "string" ? profile.email : null,
        role: typeof profile.role === "string" ? profile.role : null
      }
    : null;

  return {
    username: payload.username,
    brand: payload.brand,
    brandName: metadata.brandName?.trim() || null,
    branch: payload.branch,
    branchName: metadata.branchName?.trim() || null,
    portalRole: resolvePortalRole(payload.username),
    type: "STAFF",
    authenticatedAt: new Date().toISOString(),
    profile: prunedProfile
  };
}

function buildErrorMessage(status: number, payload: unknown) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const message = typeof record.message === "string" ? record.message.trim() : "";
    if (message) return message;
  }

  if (status === 401) return "아이디 또는 비밀번호를 다시 확인해 주세요.";
  if (status === 403) return "이 계정은 현재 접근 권한이 없습니다.";
  if (status >= 500) return "인증 서버에서 로그인 요청을 처리하지 못했습니다.";
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
    sysSeq: String(body.sysSeq ?? "").trim(),
    brand: String(body.brand ?? "").trim(),
    branch: String(body.branch ?? "").trim()
  };

  if (!payload.username || !payload.password || !payload.sysSeq || !payload.brand || !payload.branch) {
    return NextResponse.json(
      { message: "학원, 지점, 아이디, 비밀번호 정보를 모두 입력해 주세요." },
      { status: 400 }
    );
  }

  let upstreamResponse: Response;

  try {
    const url = new URL(TEACHER_LOGIN_URL);
    upstreamResponse = await fetch(TEACHER_LOGIN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        Origin: url.origin,
        Referer: `${url.origin}/`
      },
      body: JSON.stringify({
        username: payload.username,
        password: encryptPassword(payload.password),
        sysSeq: payload.sysSeq,
        brand: payload.brand,
        branch: payload.branch
      }),
      cache: "no-store"
    });
  } catch {
    return NextResponse.json({ message: "인증 서버에 연결하지 못했습니다." }, { status: 502 });
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

  const token =
    upstreamResponse.headers.get("x-auth-token") ||
    (upstreamPayload &&
    typeof upstreamPayload === "object" &&
    !Array.isArray(upstreamPayload) &&
    typeof (upstreamPayload as Record<string, unknown>).token === "string"
      ? String((upstreamPayload as Record<string, unknown>).token)
      : null);

  if (!upstreamResponse.ok || !token) {
    return NextResponse.json(
      { message: buildErrorMessage(upstreamResponse.status, upstreamPayload) },
      { status: upstreamResponse.ok ? 401 : upstreamResponse.status }
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
