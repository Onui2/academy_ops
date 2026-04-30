import { NextResponse } from "next/server";
import { runSecurityHarness } from "@/lib/harness/security/security-harness";
import { isHarnessError } from "@/lib/harness/harness-error";
import { createServiceSupabaseClient } from "@/lib/server-supabase";
import { createRequestWithHarness, listRequestsForActor } from "@/lib/services/request-hub-service";
import type { RequestCreatePayload } from "@/types/request";

function errorResponse(error: unknown, fallback: string) {
  if (isHarnessError(error)) {
    return NextResponse.json({ message: error.exposeMessage }, { status: error.status });
  }

  console.error("[requests]", error);
  return NextResponse.json({ message: fallback }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const security = runSecurityHarness(request);
    const supabase = createServiceSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ message: "서버 설정이 완료되지 않았습니다." }, { status: 503 });
    }

    const items = await listRequestsForActor(supabase, security.actor);
    return NextResponse.json({ items });
  } catch (error) {
    return errorResponse(error, "요청 목록을 불러오지 못했습니다.");
  }
}

export async function POST(request: Request) {
  try {
    const rawBody = (await request.json()) as RequestCreatePayload;
    const security = runSecurityHarness(request, rawBody);
    const supabase = createServiceSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ message: "서버 설정이 완료되지 않았습니다." }, { status: 503 });
    }

    const created = await createRequestWithHarness(supabase, security.actor, security.payload ?? rawBody, security.auditContext);
    return NextResponse.json({ ok: true, requestNo: created.requestNo });
  } catch (error) {
    return errorResponse(error, "요청을 저장하지 못했습니다.");
  }
}
