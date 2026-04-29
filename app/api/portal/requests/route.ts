import { NextResponse } from "next/server";
import { createPortalRequest, fetchPortalRequests } from "@/lib/portal-request-service";
import { createServiceSupabaseClient } from "@/lib/server-supabase";
import { readTeacherSessionFromCookieHeader } from "@/lib/teacher-session";
import type { WorkItem } from "@/types/ops";

export async function GET(request: Request) {
  const session = readTeacherSessionFromCookieHeader(request.headers.get("cookie"));
  if (!session) {
    return NextResponse.json({ message: "teacher 세션이 없습니다." }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ message: "서버 Supabase 설정이 누락되었습니다." }, { status: 503 });
  }

  try {
    const items = await fetchPortalRequests(supabase, session);
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "요청 목록을 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = readTeacherSessionFromCookieHeader(request.headers.get("cookie"));
  if (!session) {
    return NextResponse.json({ message: "teacher 세션이 없습니다." }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ message: "서버 Supabase 설정이 누락되었습니다." }, { status: 503 });
  }

  let body: {
    item?: WorkItem;
    nasPermission?: {
      user_email: string;
      resource_name: string;
      permission_level: string;
    };
  } = {};

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (!body.item) {
    return NextResponse.json({ message: "저장할 요청 데이터가 없습니다." }, { status: 400 });
  }

  try {
    await createPortalRequest(supabase, session, body.item, {
      nasPermission: body.nasPermission
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "요청 저장에 실패했습니다." },
      { status: 500 }
    );
  }
}
