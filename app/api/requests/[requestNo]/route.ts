import { NextResponse } from "next/server";
import { runSecurityHarness } from "@/lib/harness/security/security-harness";
import { isHarnessError } from "@/lib/harness/harness-error";
import { createServiceSupabaseClient } from "@/lib/server-supabase";
import { getRequestDetailForActor } from "@/lib/services/request-hub-service";

function errorResponse(error: unknown, fallback: string) {
  if (isHarnessError(error)) {
    return NextResponse.json({ message: error.exposeMessage }, { status: error.status });
  }

  console.error("[request-detail]", error);
  return NextResponse.json({ message: fallback }, { status: 500 });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ requestNo: string }> }
) {
  try {
    const { requestNo } = await context.params;
    const security = runSecurityHarness(request);
    const supabase = createServiceSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ message: "서버 설정이 완료되지 않았습니다." }, { status: 503 });
    }

    const detail = await getRequestDetailForActor(supabase, security.actor, requestNo, security.auditContext);
    if (!detail) {
      return NextResponse.json({ message: "요청을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ item: detail });
  } catch (error) {
    return errorResponse(error, "요청 상세를 불러오지 못했습니다.");
  }
}
