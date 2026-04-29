import { NextResponse } from "next/server";
import { deletePortalRequest, updatePortalRequest } from "@/lib/portal-request-service";
import { createServiceSupabaseClient } from "@/lib/server-supabase";
import { readTeacherSessionFromCookieHeader } from "@/lib/teacher-session";
import type { WorkItem } from "@/types/ops";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ requestNo: string }> }
) {
  const session = readTeacherSessionFromCookieHeader(request.headers.get("cookie"));
  if (!session) {
    return NextResponse.json({ message: "teacher 세션이 없습니다." }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ message: "서버 Supabase 설정이 누락되었습니다." }, { status: 503 });
  }

  const { requestNo } = await context.params;

  let body: { item?: WorkItem } = {};

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (!body.item) {
    return NextResponse.json({ message: "수정할 요청 데이터가 없습니다." }, { status: 400 });
  }

  try {
    await updatePortalRequest(supabase, requestNo, body.item, session);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "요청 수정에 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ requestNo: string }> }
) {
  const session = readTeacherSessionFromCookieHeader(request.headers.get("cookie"));
  if (!session || session.portalRole !== "admin") {
    return NextResponse.json({ message: "삭제 권한이 없습니다." }, { status: 403 });
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ message: "서버 Supabase 설정이 누락되었습니다." }, { status: 503 });
  }

  const { requestNo } = await context.params;

  try {
    await deletePortalRequest(supabase, requestNo);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "요청 삭제에 실패했습니다." },
      { status: 500 }
    );
  }
}
