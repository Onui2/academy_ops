import { NextResponse } from "next/server";
import { runSecurityHarness } from "@/lib/harness/security/security-harness";
import { isHarnessError } from "@/lib/harness/harness-error";
import { createServiceSupabaseClient } from "@/lib/server-supabase";
import { updateRequestWorkflowStatusForActor } from "@/lib/services/request-hub-service";
import type { RequestStatusUpdatePayload } from "@/types/request";

function errorResponse(error: unknown, fallback: string) {
  if (isHarnessError(error)) {
    return NextResponse.json({ message: error.exposeMessage }, { status: error.status });
  }

  console.error("[request-status]", error);
  return NextResponse.json({ message: fallback }, { status: 500 });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ requestNo: string }> }
) {
  try {
    const body = (await request.json()) as RequestStatusUpdatePayload;
    const { requestNo } = await context.params;
    const security = runSecurityHarness(request, body);
    const supabase = createServiceSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ message: "서버 설정이 완료되지 않았습니다." }, { status: 503 });
    }

    const detail = await updateRequestWorkflowStatusForActor(
      supabase,
      security.actor,
      requestNo,
      security.payload ?? body,
      security.auditContext
    );

    return NextResponse.json({ ok: true, item: detail });
  } catch (error) {
    return errorResponse(error, "요청 상태를 변경하지 못했습니다.");
  }
}
